import { describe, it, expect, vi } from "vitest";
import { createNode } from "@/sdk/test/server/unit";
import { IONode, defineModule } from "@/sdk/lib/server";
import type { MessageChannels, Input, Outputs, Port } from "@/sdk/lib/server";
import { ChannelStore, channelProxy, packageChannel } from "@/sdk/lib/server/channels-store";
import { NRG_PROTECTED_CHANNEL } from "@/sdk/lib/server/symbols";

// `RawIn` is the on-the-wire shape a node declares as its `Input` generic; the
// framework intersects the channels only on the `input()` parameter, so tests take
// `msg: In` inside the method but pass `RawIn` as the generic — exactly what a
// real node author sees.
type RawIn = { payload: unknown };
type In = RawIn & MessageChannels;

// These nodes are declared INLINE (not in a `src/server` tree), so the build-time
// port-name extractor never runs on them and their named "out" port has no
// resolvable index at runtime. They therefore emit by NUMERIC index (`send(0, …)`)
// — the documented escape hatch for a node whose topology isn't extracted. The
// channel behaviour under test is identical for named and numeric ports (both take
// the same `#sendToPort` delivery path).

/** Emits values on all three channels. */
class Producer extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ out: number }> }>
> {
  static override readonly type = "channel-producer";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input() {
    this.send(0, { out: 1 }, { trace: "abc" }, { secret: 99 });
  }
}

/** Emits channels via `send` to a numeric port — the channels ride the emitted frame
 * exactly as they do for a named port (same `#sendToPort` delivery path). */
class PortProducer extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ out: number }> }>
> {
  static override readonly type = "channel-port-producer";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input() {
    this.send(0, { out: 1 }, { trace: "abc" }, { secret: 99 });
  }
}

/** Reads a wire field and a private channel WITHOUT annotating the `input` parameter —
 * proving the base `InputMessage<Input>` (wire + channels) is inferred, so an author
 * declares the wire type ONCE (the generic) and needs no `& MessageChannels`. The
 * framework key `_msgid` is deliberately NOT inferred onto the parameter (a
 * compile-time proof of that lives in the .test-d.ts). */
class OmitReader extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ payload: unknown; secret: unknown }> }>
> {
  static override readonly type = "channel-omit-reader";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg) {
    this.send(0, { payload: msg.payload, secret: msg.private.secret });
  }
}

/** Reads both channels off the incoming signal and echoes them onto its public
 * output — so a test asserts what it RECEIVED via the observable `sent()`, not a
 * peek inside `input()`. `keys` proves the channels never appear in enumeration. */
class Consumer extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ trace: unknown; secret: unknown; keys: string[] }> }>
> {
  static override readonly type = "channel-consumer";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg: In) {
    this.send(0, {
      trace: msg.protected.trace,
      secret: msg.private.secret,
      keys: Object.keys(msg), // channels must NOT appear here
    });
  }
}

/** Reads a private resource, deletes it, and echoes the before/after so a test
 * can see the delete took effect — without reaching into the node. */
class Deleter extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ before: unknown; after: unknown }> }>
> {
  static override readonly type = "channel-deleter";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg: In) {
    const before = msg.private.res;
    delete msg.private.res;
    this.send(0, { before, after: msg.private.res });
  }
}

/** Same as Deleter, but for the shared `protected` channel. */
class ProtectedDeleter extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ before: unknown; after: unknown }> }>
> {
  static override readonly type = "channel-protected-deleter";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg: In) {
    const before = msg.protected.token;
    delete msg.protected.token;
    this.send(0, { before, after: msg.protected.token });
  }
}

/** A SOURCE node (no input port): emits from `created()` with no incoming
 * message, so `send()` must mint a fresh `_msgid` and stamp it on the outgoing
 * frame for the channels to be recoverable downstream. */
class Source extends IONode<
  Record<string, never>,
  unknown,
  never,
  Outputs<{ out: Port<{ tick: number }> }>
> {
  static override readonly type = "channel-source";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async created() {
    this.send(0, { tick: 1 }, { trace: "src" }, { secret: 7 });
  }
}

/** A pass-through MIDDLE node: a PLAIN `send()` with NO channel args that never
 * reads the channels either. The upstream's contributions must persist on the
 * emitted frame — they live in the store keyed by `_msgid`, which the plain send
 * inherits — proving the STICKY-channel guarantee (see #writeChannels). */
class Passthrough extends IONode<
  Record<string, never>,
  unknown,
  Input<Port<RawIn>>,
  Outputs<{ out: Port<{ ok: boolean }> }>
> {
  static override readonly type = "channel-passthrough";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input() {
    this.send(0, { ok: true }); // plain send — no channel args, no channel reads
  }
}

describe("message channels (protected / private)", () => {
  it("channelProxy reads / writes / deletes through the store", () => {
    const store = new ChannelStore();
    const channel = channelProxy(store, "m", NRG_PROTECTED_CHANNEL);

    channel.x = 1;
    expect(channel.x).toBe(1);
    expect(store.get("m", NRG_PROTECTED_CHANNEL, "x")).toBe(1);
    expect("x" in channel).toBe(true);

    delete channel.x;
    expect(channel.x).toBeUndefined();
    expect("x" in channel).toBe(false);
  });

  it("a producer emits protected + private on the outgoing signal", async () => {
    const { node } = await createNode(Producer, {});
    await node.receive({ _msgid: "sig-1", payload: {} });

    // The sender asserts what it output on each channel, read off the emitted frame:
    expect(node.sent(0)[0].protected.trace).toBe("abc");
    expect(node.sent(0)[0].private.secret).toBe(99);
    // …but the channels never ride the serialized wire message:
    expect(Object.keys(node.sent(0)[0])).not.toContain("protected");
    expect(Object.keys(node.sent(0)[0])).not.toContain("private");
  });

  it("un-annotated input() infers the wire type and channels (not _msgid)", async () => {
    const { node } = await createNode(OmitReader, {});
    await node.receive(
      { _msgid: "sig-omit", payload: { hi: 1 } },
      { private: { secret: 42 } },
    );
    const out = node.sent()[0][0].output;
    expect(out.payload).toEqual({ hi: 1 });
    expect(out.secret).toBe(42);
  });

  it("send to a numeric port carries protected + private on the emitted frame", async () => {
    const { node } = await createNode(PortProducer, {});
    await node.receive({ _msgid: "sig-port", payload: {} });

    expect(node.sent(0)[0].protected.trace).toBe("abc");
    expect(node.sent(0)[0].private.secret).toBe(99);
    // channels stay off the serialized frame:
    expect(Object.keys(node.sent(0)[0])).not.toContain("private");
  });

  it("a consumer receives protected + private, hidden from enumeration", async () => {
    const { node } = await createNode(Consumer, {});

    // Provide the channels an upstream node would have attached to this signal:
    await node.receive(
      { _msgid: "sig-2", payload: {} },
      { protected: { trace: "abc" }, private: { secret: 99 } },
    );

    // It echoed what it received onto its output — that's the observable proof:
    const out = node.sent()[0][0].output;
    expect(out.trace).toBe("abc");
    expect(out.secret).toBe(99);
    // The author-facing enumeration never reveals the channels:
    expect(out.keys).not.toContain("protected");
    expect(out.keys).not.toContain("private");
  });

  it("delete msg.private.x removes the entry (the node no longer sees it)", async () => {
    const { node } = await createNode(Deleter, {});

    await node.receive(
      { _msgid: "sig-3", payload: {} },
      { private: { res: "R" } },
    );

    const out = node.sent()[0][0].output;
    expect(out.before).toBe("R"); // read before the delete
    expect(out.after).toBeUndefined(); // gone after
  });

  it("a channelProxy enumerates its keys (Object.keys / spread / descriptors)", () => {
    const store = new ChannelStore();
    const channel = channelProxy(store, "m", NRG_PROTECTED_CHANNEL);
    channel.a = 1;
    channel.b = 2;

    expect(Object.keys(channel).sort()).toEqual(["a", "b"]);
    expect({ ...channel }).toEqual({ a: 1, b: 2 });
    expect(Object.getOwnPropertyDescriptor(channel, "a")).toMatchObject({
      enumerable: true,
      configurable: true,
      value: 1,
    });
    expect(Object.getOwnPropertyDescriptor(channel, "missing")).toBeUndefined();
  });

  it("a channelProxy for a message with no _msgid is inert", () => {
    const store = new ChannelStore();
    const channel = channelProxy(store, undefined, NRG_PROTECTED_CHANNEL);

    channel.a = 1; // no-op — nothing is keyed under `undefined`
    expect(channel.a).toBeUndefined();
    expect(Object.keys(channel)).toEqual([]);
    expect("a" in channel).toBe(false);
  });

  it("sweeps only idle signals on the TTL, keeps active ones, and re-arms", () => {
    vi.useFakeTimers();
    try {
      const store = new ChannelStore({ ttlMs: 1000, sweepMs: 100 });
      store.set("dead", NRG_PROTECTED_CHANNEL, "x", 1);
      store.set("alive", NRG_PROTECTED_CHANNEL, "y", 2);

      vi.advanceTimersByTime(600);
      expect(store.get("alive", NRG_PROTECTED_CHANNEL, "y")).toBe(2); // touch → stays warm

      vi.advanceTimersByTime(600); // "dead" now idle > ttl; "alive" touched at 600
      expect(store.get("dead", NRG_PROTECTED_CHANNEL, "x")).toBeUndefined(); // swept
      expect(store.get("alive", NRG_PROTECTED_CHANNEL, "y")).toBe(2); // survived

      // Let "alive" go idle → swept, sweeper self-stops when the store empties,
      // then a later write re-arms it and that entry ages out too.
      vi.advanceTimersByTime(2000);
      expect(store.get("alive", NRG_PROTECTED_CHANNEL, "y")).toBeUndefined();
      store.set("reborn", NRG_PROTECTED_CHANNEL, "z", 3);
      vi.advanceTimersByTime(2000);
      expect(store.get("reborn", NRG_PROTECTED_CHANNEL, "z")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a source send (no incoming _msgid) mints one and carries the channels", async () => {
    const { node } = await createNode(Source, {});
    // created() already emitted — no node.receive, so there is no incoming _msgid.
    expect(node.sent()).toHaveLength(1);

    const frame = node.sent(0)[0];
    // a fresh _msgid was minted and stamped on the outgoing frame...
    expect((frame as Record<string, any>)._msgid).toEqual(expect.any(String));
    // ...and both channels resolve through it:
    expect(frame.protected.trace).toBe("src");
    expect(frame.private.secret).toBe(7);
  });

  it("STICKY channels persist across a plain middle send (same _msgid)", async () => {
    const { node } = await createNode(Passthrough, {});
    await node.receive(
      { _msgid: "sig-sticky", payload: {} },
      { protected: { trace: "up" }, private: { secret: 5 } },
    );

    const frame = node.sent(0)[0];
    // The plain send neither wrote nor read channels, yet the upstream contributions
    // still resolve on the emitted frame: they live in the store keyed by _msgid,
    // which the emitted frame inherits.
    expect(frame.protected.trace).toBe("up");
    expect(frame.private.secret).toBe(5);
    // …carried by the same _msgid that keeps them alive (never re-keyed).
    expect((frame as Record<string, unknown>)._msgid).toBe("sig-sticky");
  });

  it("delete msg.protected.x removes the entry (the node no longer sees it)", async () => {
    const { node } = await createNode(ProtectedDeleter, {});

    await node.receive(
      { _msgid: "sig-p", payload: {} },
      { protected: { token: "T" } },
    );

    const out = node.sent()[0][0].output;
    expect(out.before).toBe("T");
    expect(out.after).toBeUndefined();
  });

  it("defineModule scopes private per package; protected stays shared", () => {
    class PkgA1 extends IONode<
      Record<string, never>,
      unknown,
      Input<Port<RawIn>>,
      never
    > {
      static override readonly type = "pkg-a1";
      override async input() {}
    }
    class PkgA2 extends IONode<
      Record<string, never>,
      unknown,
      Input<Port<RawIn>>,
      never
    > {
      static override readonly type = "pkg-a2";
      override async input() {}
    }
    class PkgB extends IONode<
      Record<string, never>,
      unknown,
      Input<Port<RawIn>>,
      never
    > {
      static override readonly type = "pkg-b";
      override async input() {}
    }
    defineModule({ nodes: [PkgA1, PkgA2] }); // one package
    defineModule({ nodes: [PkgB] }); // a different package

    // same package → same partition; different package → different partition
    expect(packageChannel(PkgA1)).toBe(packageChannel(PkgA2));
    expect(packageChannel(PkgA1)).not.toBe(packageChannel(PkgB));

    const store = new ChannelStore();
    store.set("sig", packageChannel(PkgA1), "secret", 1);
    // a same-package node reads it; a different-package node cannot:
    expect(store.get("sig", packageChannel(PkgA2), "secret")).toBe(1);
    expect(store.get("sig", packageChannel(PkgB), "secret")).toBeUndefined();
    // protected is shared regardless of package:
    store.set("sig", NRG_PROTECTED_CHANNEL, "trace", "T");
    expect(store.get("sig", NRG_PROTECTED_CHANNEL, "trace")).toBe("T");
  });
});
