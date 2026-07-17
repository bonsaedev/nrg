import { describe, it, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";
import TdSingle from "./fixtures/sent-typing-test/td-single";
import TdTuple from "./fixtures/sent-typing-test/td-tuple";
import TdRecord from "./fixtures/sent-typing-test/td-record";
import TdPrimitivePorts from "./fixtures/sent-typing-test/td-primitive-ports";
import TdSingleObjOfObj from "./fixtures/sent-typing-test/td-single-obj-of-obj";
import TdAnyOutput from "./fixtures/sent-typing-test/td-any-output";
import TdSource from "./fixtures/sent-typing-test/td-source";

// These proofs are never executed — they exist so `tsc` (run via `pnpm
// validate:tsc`) verifies that `node.sent()` is typed positionally from the
// node's declared Input/Output generics, with no casts and no `any` in the
// assertions.
//
// Each fixture node is TYPES-ONLY: its ports come purely from its generics
// (there is no inputSchema/outputsSchema fallback anymore). In un-built source
// there is no `__nrgPorts` static, so point the topology extractor at the fixture
// tree — exactly as the build does — so `createNode` stamps the real topology.
const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/sent-typing-test", import.meta.url),
);

describe("sent() positional typing (from the node's Input/Output generics)", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  // --- single output -------------------------------------------------------
  it("types a single output positionally at sent()[i][0]", async () => {
    const { node } = await createNode(TdSingle);
    // sent()[emission][port] IS the record — the port's fields at the top level
    const id: string = node.sent()[0][0].id;
    void id;
    // @ts-expect-error id is a string, not a number
    const bad: number = node.sent()[0][0].id;
    void bad;
  });

  // --- converted tuple → named-port multi-output ---------------------------
  it("types a converted tuple's named ports precisely via sent(name)", async () => {
    const { node } = await createNode(TdTuple);
    // Precise per-port access is by NAME. Positional `sent()[i][0]`/`[i][1]` is the
    // sound UNION of the ports' values (record key order is not type-recoverable),
    // so `sent(name)` is the precise accessor.
    const a: string = node.sent("out0")[0].a;
    const b: number = node.sent("out1")[0].b;
    void a;
    void b;
    // @ts-expect-error port out1 holds { b: number }, it has no `a`
    const bad: string = node.sent("out1")[0].a;
    void bad;
  });

  // --- named-port (record) multi-output ------------------------------------
  it("types named ports precisely via sent(name)", async () => {
    const { node } = await createNode(TdRecord);
    // named access is precise (record key order is not type-recoverable, so this
    // is the precise per-port accessor)
    const ok: string = node.sent("success")[0].ok;
    const err: number = node.sent("failure")[0].err;
    void ok;
    void err;
    // Anti-`any` guard: if the record-port output ever widens to `any` (the
    // failure mode of a brand/resolver regression) the positive assertions above
    // still compile, so pin a type mismatch that only breaks when it's precise.
    // @ts-expect-error ok is a string, not a number
    const badOk: number = node.sent("success")[0].ok;
    void badOk;
    // @ts-expect-error "missing" is not a declared port
    node.sent("missing");
    // @ts-expect-error named-port nodes emit via send(name, value); send(map) is unsound
    node.send({ success: { ok: "y" }, failure: { err: 1 } });
  });

  // --- M1(a): a record with PRIMITIVE-valued ports stays fully addressable --
  // (the old structural gate `Record<string, Record<string, any>>` let one
  // primitive port de-type the whole record → names became unaddressable).
  it("keeps primitive-valued named ports addressable", async () => {
    const { node } = await createNode(TdPrimitivePorts);
    // (runtime now requires OBJECT additions; primitive-valued ports remain
    // type-addressable by name, which is what this proof pins)
    const ok: string = node.sent("success")[0];
    const err: number = node.sent("failure")[0];
    void ok;
    void err;
    // @ts-expect-error "success" carries a string message, not a number
    node.send("success", 1);
    // @ts-expect-error "missing" is not a declared port
    node.send("missing", "x");
  });

  // --- M1(b): a single object-of-objects output must NOT expose its fields as
  //     ports (the old gate matched it as a record → fake, silently-dropped ports).
  it("treats a single object-of-objects output as ONE port", async () => {
    const { node } = await createNode(TdSingleObjOfObj);
    // it is ONE output port (port 0), addressed by send("out", …)/index — not by field.
    const v: number = node.sent()[0][0].meta.v;
    void v;
    // @ts-expect-error "meta" is a field of the single output, not an output port
    node.send("meta", { v: 1 });
  });

  // --- M1(d): an untyped output (Output = any) stays permissive: any port
  //     name/index and any message.
  it("stays permissive for an untyped (any) output", async () => {
    const { node } = await createNode(TdAnyOutput);
    // The read side stays permissive too: sent(name) and sent(index) are both
    // allowed (each message is `any`), mirroring sendToPort — `sent` uses the same
    // `OutputPortNames` as the runtime, so there's no stricter test-only variant.
    const byName = node.sent("whatever")[0];
    const byIndex = node.sent(3)[0];
    void byName;
    void byIndex;
  });

  // --- source node: a `never` INPUT (no input port) must not poison the emitted
  //     message type. A source emits from outside input() carrying no incoming
  //     message, so sent()[i][0] is the output record itself, never `never`.
  it("types a never-input source node's single output at sent()[i][0]", async () => {
    const { node } = await createNode(TdSource);
    const id: string = node.sent()[0][0].event.id;
    void id;
    // @ts-expect-error event.id is a string, not a number
    const bad: number = node.sent()[0][0].event.id;
    void bad;
  });

  // --- receive() is typed from the WIRE even for the idiomatic no-parameter
  //     input() style — NOT silently `unknown` (which would let a wrong wire pass).
  it("types receive() from the wire for a no-parameter input()", async () => {
    // TdSingle declares Input<Port<{ in: string }>> and `override async input()`
    // with NO parameter — the wire is recovered from the node's own receive() param.
    const { node } = await createNode(TdSingle);
    await node.receive({ in: "ok" }); // the wire shape (extra props allowed)
    // @ts-expect-error — a wrong wire is rejected; if receive() were `unknown`-typed
    // (the bug) this would compile and silently pass a bad message.
    await node.receive({ wrong: true });
  });
});
