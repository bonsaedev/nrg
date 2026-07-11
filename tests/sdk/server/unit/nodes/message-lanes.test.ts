import { describe, it, expect, vi } from "vitest";
import { createNode } from "@/sdk/test/server/unit";
import { IONode, defineModule } from "@/sdk/lib/server";
import type { MessageLanes } from "@/sdk/lib/server";
import { LaneStore, laneProxy, packageLane } from "@/sdk/lib/server/lane-store";
import { NRG_PROTECTED_LANE } from "@/sdk/lib/server/symbols";

// `RawIn` is the on-the-wire shape a node declares as its `Input` generic; the
// framework intersects the lanes only on the `input()` parameter, so tests take
// `msg: In` inside the method but pass `RawIn` as the generic — exactly what a
// real node author sees.
type RawIn = { payload: unknown; _msgid?: string };
type In = RawIn & MessageLanes;

/** Emits values on all three lanes. */
class Producer extends IONode<
  Record<string, never>,
  unknown,
  RawIn,
  { out: number }
> {
  static override readonly type = "lane-producer";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input() {
    this.send({ out: 1 }, { trace: "abc" }, { secret: 99 });
  }
}

/** Emits lanes via `sendToPort` — the lanes ride the emitted frame just like
 * `send()` (same `#sendToPort` delivery path for numeric and named ports). */
class PortProducer extends IONode<
  Record<string, never>,
  unknown,
  RawIn,
  { out: number }
> {
  static override readonly type = "lane-port-producer";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input() {
    this.sendToPort(0, { out: 1 }, { trace: "abc" }, { secret: 99 });
  }
}

/** Reads both lanes off the incoming signal and echoes them onto its public
 * output — so a test asserts what it RECEIVED via the observable `sent()`, not a
 * peek inside `input()`. `keys` proves the lanes never appear in enumeration. */
class Consumer extends IONode<
  Record<string, never>,
  unknown,
  RawIn,
  { trace: unknown; secret: unknown; keys: string[] }
> {
  static override readonly type = "lane-consumer";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg: In) {
    this.send({
      trace: msg.protected.trace,
      secret: msg.private.secret,
      keys: Object.keys(msg), // lanes must NOT appear here
    });
  }
}

/** Reads a private resource, deletes it, and echoes the before/after so a test
 * can see the delete took effect — without reaching into the node. */
class Deleter extends IONode<
  Record<string, never>,
  unknown,
  RawIn,
  { before: unknown; after: unknown }
> {
  static override readonly type = "lane-deleter";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg: In) {
    const before = msg.private.res;
    delete msg.private.res;
    this.send({ before, after: msg.private.res });
  }
}

/** Same as Deleter, but for the shared `protected` lane. */
class ProtectedDeleter extends IONode<
  Record<string, never>,
  unknown,
  RawIn,
  { before: unknown; after: unknown }
> {
  static override readonly type = "lane-protected-deleter";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(msg: In) {
    const before = msg.protected.token;
    delete msg.protected.token;
    this.send({ before, after: msg.protected.token });
  }
}

/** A SOURCE node (no input port): emits from `created()` with no incoming
 * message, so `send()` must mint a fresh `_msgid` and stamp it on the outgoing
 * frame for the lanes to be recoverable downstream. */
class Source extends IONode<
  Record<string, never>,
  unknown,
  never,
  { tick: number }
> {
  static override readonly type = "lane-source";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async created() {
    this.send({ tick: 1 }, { trace: "src" }, { secret: 7 });
  }
}

describe("message lanes (protected / private)", () => {
  it("laneProxy reads / writes / deletes through the store", () => {
    const store = new LaneStore();
    const lane = laneProxy(store, "m", NRG_PROTECTED_LANE);

    lane.x = 1;
    expect(lane.x).toBe(1);
    expect(store.get("m", NRG_PROTECTED_LANE, "x")).toBe(1);
    expect("x" in lane).toBe(true);

    delete lane.x;
    expect(lane.x).toBeUndefined();
    expect("x" in lane).toBe(false);
  });

  it("a producer emits protected + private on the outgoing signal", async () => {
    const { node } = await createNode(Producer, {});
    await node.receive({ _msgid: "sig-1", payload: {} });

    // The sender asserts what it output on each lane, read off the emitted frame:
    expect(node.sent(0)[0].protected.trace).toBe("abc");
    expect(node.sent(0)[0].private.secret).toBe(99);
    // …but the lanes never ride the serialized wire message:
    expect(Object.keys(node.sent(0)[0])).not.toContain("protected");
    expect(Object.keys(node.sent(0)[0])).not.toContain("private");
  });

  it("sendToPort carries protected + private on the emitted frame", async () => {
    const { node } = await createNode(PortProducer, {});
    await node.receive({ _msgid: "sig-port", payload: {} });

    expect(node.sent(0)[0].protected.trace).toBe("abc");
    expect(node.sent(0)[0].private.secret).toBe(99);
    // lanes stay off the serialized frame:
    expect(Object.keys(node.sent(0)[0])).not.toContain("private");
  });

  it("a consumer receives protected + private, hidden from enumeration", async () => {
    const { node } = await createNode(Consumer, {});

    // Provide the lanes an upstream node would have attached to this signal:
    await node.receive(
      { _msgid: "sig-2", payload: {} },
      { protected: { trace: "abc" }, private: { secret: 99 } },
    );

    // It echoed what it received onto its output — that's the observable proof:
    const out = node.sent()[0][0].output;
    expect(out.trace).toBe("abc");
    expect(out.secret).toBe(99);
    // The author-facing enumeration never reveals the lanes:
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

  it("a laneProxy enumerates its keys (Object.keys / spread / descriptors)", () => {
    const store = new LaneStore();
    const lane = laneProxy(store, "m", NRG_PROTECTED_LANE);
    lane.a = 1;
    lane.b = 2;

    expect(Object.keys(lane).sort()).toEqual(["a", "b"]);
    expect({ ...lane }).toEqual({ a: 1, b: 2 });
    expect(Object.getOwnPropertyDescriptor(lane, "a")).toMatchObject({
      enumerable: true,
      configurable: true,
      value: 1,
    });
    expect(Object.getOwnPropertyDescriptor(lane, "missing")).toBeUndefined();
  });

  it("a laneProxy for a message with no _msgid is inert", () => {
    const store = new LaneStore();
    const lane = laneProxy(store, undefined, NRG_PROTECTED_LANE);

    lane.a = 1; // no-op — nothing is keyed under `undefined`
    expect(lane.a).toBeUndefined();
    expect(Object.keys(lane)).toEqual([]);
    expect("a" in lane).toBe(false);
  });

  it("sweeps only idle signals on the TTL, keeps active ones, and re-arms", () => {
    vi.useFakeTimers();
    try {
      const store = new LaneStore({ ttlMs: 1000, sweepMs: 100 });
      store.set("dead", NRG_PROTECTED_LANE, "x", 1);
      store.set("alive", NRG_PROTECTED_LANE, "y", 2);

      vi.advanceTimersByTime(600);
      expect(store.get("alive", NRG_PROTECTED_LANE, "y")).toBe(2); // touch → stays warm

      vi.advanceTimersByTime(600); // "dead" now idle > ttl; "alive" touched at 600
      expect(store.get("dead", NRG_PROTECTED_LANE, "x")).toBeUndefined(); // swept
      expect(store.get("alive", NRG_PROTECTED_LANE, "y")).toBe(2); // survived

      // Let "alive" go idle → swept, sweeper self-stops when the store empties,
      // then a later write re-arms it and that entry ages out too.
      vi.advanceTimersByTime(2000);
      expect(store.get("alive", NRG_PROTECTED_LANE, "y")).toBeUndefined();
      store.set("reborn", NRG_PROTECTED_LANE, "z", 3);
      vi.advanceTimersByTime(2000);
      expect(store.get("reborn", NRG_PROTECTED_LANE, "z")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a source send (no incoming _msgid) mints one and carries the lanes", async () => {
    const { node } = await createNode(Source, {});
    // created() already emitted — no node.receive, so there is no incoming _msgid.
    expect(node.sent()).toHaveLength(1);

    const frame = node.sent(0)[0];
    // a fresh _msgid was minted and stamped on the outgoing frame...
    expect((frame as Record<string, any>)._msgid).toEqual(expect.any(String));
    // ...and both lanes resolve through it:
    expect(frame.protected.trace).toBe("src");
    expect(frame.private.secret).toBe(7);
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
    class PkgA1 extends IONode<Record<string, never>, unknown, RawIn, never> {
      static override readonly type = "pkg-a1";
      override async input() {}
    }
    class PkgA2 extends IONode<Record<string, never>, unknown, RawIn, never> {
      static override readonly type = "pkg-a2";
      override async input() {}
    }
    class PkgB extends IONode<Record<string, never>, unknown, RawIn, never> {
      static override readonly type = "pkg-b";
      override async input() {}
    }
    defineModule({ nodes: [PkgA1, PkgA2] }); // one package
    defineModule({ nodes: [PkgB] }); // a different package

    // same package → same partition; different package → different partition
    expect(packageLane(PkgA1)).toBe(packageLane(PkgA2));
    expect(packageLane(PkgA1)).not.toBe(packageLane(PkgB));

    const store = new LaneStore();
    store.set("sig", packageLane(PkgA1), "secret", 1);
    // a same-package node reads it; a different-package node cannot:
    expect(store.get("sig", packageLane(PkgA2), "secret")).toBe(1);
    expect(store.get("sig", packageLane(PkgB), "secret")).toBeUndefined();
    // protected is shared regardless of package:
    store.set("sig", NRG_PROTECTED_LANE, "trace", "T");
    expect(store.get("sig", NRG_PROTECTED_LANE, "trace")).toBe("T");
  });
});
