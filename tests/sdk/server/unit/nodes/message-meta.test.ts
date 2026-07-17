import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { createNode } from "@/sdk/test/server/unit";
import { Meta } from "@/sdk/lib/server";
import MetaSender from "../fixtures/message-meta-test/meta-sender";
import MetaReceiver from "../fixtures/message-meta-test/meta-receiver";

// `msg[Meta]` — the message-metadata accessor — end to end with a real SENDER and
// RECEIVER (fixtures under message-meta-test/, topology stamped by the real
// extractor):
//
//   SENDER:   does NOTHING about Meta — the framework stamps the provenance on
//             every send, onto the clone-safe `_meta` root carrier.
//   RECEIVER: reads `msg[Meta].source`, typed, no cast — the framework installs
//             the symbol accessor on the incoming message at delivery, exactly
//             like `msg[Channels]`.
//
// The ACCESSOR is symbol-keyed (never collides with data fields, invisible to
// JSON/Object.keys) and is REINSTALLED at every delivery from the `_meta`
// carrier — an enumerable root key, because Node-RED's fan-out clone (messages
// 2..N) drops symbol properties. The carrier is framework-internal: it never
// appears on a typed surface, like `_msgid`.

const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/message-meta-test", import.meta.url),
);

describe("msg[Meta] — sender/receiver provenance", () => {
  let prevSrc: string | undefined;
  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });
  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("the receiver reads the sender's provenance off msg[Meta].source, typed", async () => {
    const { node: sender } = await createNode(MetaSender);
    const { node: receiver } = await createNode(MetaReceiver);

    await sender.receive({ payload: "world", _msgid: "m1" });
    const frame = sender.sent("out")[0];
    // The frame IS the record — the sent fields sit at the top level:
    expect(frame.greeting).toBe("hi world");
    // The harness exposes the same accessor on emitted frames:
    expect(frame[Meta].source).toMatchObject({
      type: "meta-sender",
      port: 0,
      portName: "out",
    });

    // Deliver the frame's enumerable DATA, as Node-RED would; the receiver's
    // accessor is reinstalled at delivery from the `_meta` carrier:
    await receiver.receive({
      greeting: frame.greeting,
      _meta: { source: frame[Meta].source },
      _msgid: "m1",
    });
    const out = receiver.sent("out")[0];
    expect(out.producedBy).toBe(frame[Meta].source?.id);
    expect(out.fromPort).toBe(0);
  });

  it("provenance survives Node-RED's fan-out clone (which drops symbols)", async () => {
    const { node: sender } = await createNode(MetaSender);
    const { node: receiver } = await createNode(MetaReceiver);

    await sender.receive({ payload: "clone", _msgid: "m2" });
    const frame = sender.sent("out")[0];

    // messages 2..N on a fan-out are CLONES: symbol accessors are gone, the
    // enumerable `_meta` carrier survives — exactly what structuredClone models.
    const clone = structuredClone({
      greeting: frame.greeting,
      _meta: { source: frame[Meta].source },
      _msgid: "m2",
    });
    expect(Object.getOwnPropertySymbols(clone)).toEqual([]); // symbols really gone
    await receiver.receive(clone);

    const out = receiver.sent("out")[0];
    expect(out.producedBy).toBe(frame[Meta].source?.id); // same producer, via the clone
    expect(out.fromPort).toBe(0);
  });

  it("a non-nrg upstream (core node / bare message) reads as source: undefined", async () => {
    const { node: receiver } = await createNode(MetaReceiver);
    await receiver.receive({ _msgid: "m3" }); // no provenance carrier at all
    const out = receiver.sent("out")[0];
    expect(out.producedBy).toBe("non-nrg");
    expect(out.fromPort).toBeUndefined();
  });

  it("the accessor is symbol-keyed and off the data surface; _meta is the carrier", async () => {
    const { node: sender } = await createNode(MetaSender);
    await sender.receive({ payload: "x", _msgid: "m4" });
    const frame = sender.sent("out")[0];
    expect(frame.greeting).toBe("hi x");
    // the accessor never leaks into enumeration/serialization:
    expect(JSON.stringify(frame)).not.toContain("nrg.meta");
    // the CARRIER is an enumerable root key (clone-safety), framework-owned:
    expect(Object.keys(frame)).toContain("_meta");
  });
});
