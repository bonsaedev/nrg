import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { createNode } from "@/sdk/test/server/unit";
import { Meta } from "@/sdk/lib/server";
import CtxSingle from "../fixtures/context-modes-test/ctx-single";
import CtxDefaultReset from "../fixtures/context-modes-test/ctx-default-reset";
import CtxMulti from "../fixtures/context-modes-test/ctx-multi";
import CtxNamed from "../fixtures/context-modes-test/ctx-named";

// Context modes — HOW a data port builds its outgoing record from a send's named
// additions:
//
//   merge (the default): `{ ...incomingRecord, ...additions }` — the message is
//     the flow's shared ACCUMULATING record. Everything upstream flows through
//     untouched; this port's fields land on top; the incoming `_meta` is REPLACED
//     by this node's provenance (`_meta.source` = producing node + port).
//   reset: `{ ...additions }` — a fresh record, for emissions that begin a new
//     logical signal. Both modes preserve the incoming `_msgid` (lineage never
//     forks mid-flow).
//
// The mode resolves PER OUTPUT PORT from `config.outputContextModes[portIndex]`
// (a framework control on every IONode): a flow author sets it in the editor, a
// node author seeds a default via `SchemaType.OutputContextModes({ default })`,
// and an unset port is `merge`. The read is lenient — only an explicit `"reset"`
// resets; the legacy `"passthrough"` value (flows saved before the merge rename)
// resolves to `merge`.

// A data-port `_meta.source`: node identity + the port index and, for a named
// `Port<T>`-record port, the port name.
const src = (port: number, portName: string) => ({
  id: expect.any(String),
  type: expect.any(String),
  name: expect.any(String),
  port,
  portName,
});

// The fixture nodes are TYPES-ONLY (no output schemas); their port topology
// lives in their generics. Point the extractor at the fixture tree so createNode
// stamps the real topology (`__nrgPorts`), exactly as the build would.
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/context-modes-test", import.meta.url),
);

let prevSrc: string | undefined;

beforeAll(() => {
  prevSrc = process.env.NRG_SERVER_SRC;
  process.env.NRG_SERVER_SRC = FIXTURE_DIR;
});

afterAll(() => {
  if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
  else process.env.NRG_SERVER_SRC = prevSrc;
});

describe("context modes — merge (the default)", () => {
  it("merges the send's fields onto the incoming record — nothing declared, nothing lost", async () => {
    const { node } = await createNode(CtxSingle);
    await node.receive({ topic: "orders", correlationId: "c1", _msgid: "m1" });

    // The frame IS the record: upstream fields carried, the addition on top,
    // this node's provenance in `_meta`, the lineage id preserved.
    expect(node.sent("out")[0]).toEqual({
      topic: "orders",
      correlationId: "c1",
      result: "R",
      _meta: { source: src(0, "out") },
      _msgid: "m1",
    });
  });

  it("replaces the incoming record's _meta with THIS node's provenance", async () => {
    const { node } = await createNode(CtxSingle);
    // The incoming record already carries an upstream producer's `_meta`:
    await node.receive({
      topic: "t",
      _meta: { source: { id: "upstream", type: "up", name: "", port: 3 } },
      _msgid: "m2",
    });

    // Merge carries the DATA fields but never the old provenance — the outgoing
    // record has exactly one `_meta`, this node's (no nesting, no duplication).
    const frame = node.sent("out")[0];
    expect(frame).toEqual({
      topic: "t",
      result: "R",
      _meta: { source: src(0, "out") },
      _msgid: "m2",
    });
    // The typed accessor reads the same carrier:
    expect(frame[Meta].source).toMatchObject({
      type: "ctx-single",
      port: 0,
      portName: "out",
    });
    expect(frame[Meta].source?.id).not.toBe("upstream");
  });

  it("an addition that collides with an incoming field wins (last write)", async () => {
    const { node } = await createNode(CtxSingle);
    await node.receive({ result: "stale", topic: "t", _msgid: "m3" });

    expect(node.sent("out")[0]).toEqual({
      topic: "t",
      result: "R", // this send's value, not the carried "stale"
      _meta: { source: src(0, "out") },
      _msgid: "m3",
    });
  });

  it("stamps no _msgid when the processed record has none (source-ish input)", async () => {
    const { node } = await createNode(CtxSingle);
    await node.receive({ topic: "t" });

    expect(node.sent("out")[0]).toEqual({
      topic: "t",
      result: "R",
      _meta: { source: src(0, "out") },
    });
  });
});

describe("context modes — reset", () => {
  it("the flow author sets reset on a port via config: a fresh record", async () => {
    const { node } = await createNode(CtxSingle, {
      config: { outputContextModes: { 0: "reset" } },
    });
    await node.receive({ topic: "t", correlationId: "stale", _msgid: "m1" });

    // Nothing accumulates: only the additions, the provenance, and the lineage
    // id (reset drops DATA, never the `_msgid` — correlation must survive).
    expect(node.sent("out")[0]).toEqual({
      result: "R",
      _meta: { source: src(0, "out") },
      _msgid: "m1",
    });
  });

  it("a node author seeds a default reset via SchemaType.OutputContextModes({ default })", async () => {
    // CtxDefaultReset declares `outputContextModes` in its configSchema with
    // `default: { 0: "reset" }` — no flow-author config needed.
    const { node } = await createNode(CtxDefaultReset);
    await node.receive({ topic: "t", _msgid: "m1" });

    expect(node.sent("out")[0]).toEqual({
      result: "fresh",
      _meta: { source: src(0, "out") },
      _msgid: "m1",
    });
  });

  it("the flow author can override an author-seeded reset back to merge", async () => {
    // The author default is only a DEFAULT — the flow author's editor value wins.
    const { node } = await createNode(CtxDefaultReset, {
      config: { outputContextModes: { 0: "merge" } },
    });
    await node.receive({ topic: "t", _msgid: "m1" });

    expect(node.sent("out")[0]).toEqual({
      topic: "t", // carried again — merge restored
      result: "fresh",
      _meta: { source: src(0, "out") },
      _msgid: "m1",
    });
  });
});

describe("context modes — legacy passthrough", () => {
  it('a stored "passthrough" (pre-rename flow) resolves to merge', async () => {
    // Flows saved before the rename carry "passthrough"; the lenient read maps
    // anything but an explicit "reset" to merge, so old flows keep accumulating.
    const { node } = await createNode(CtxSingle, {
      config: { outputContextModes: { 0: "passthrough" } },
    });
    await node.receive({ topic: "t", _msgid: "m1" });

    expect(node.sent("out")[0]).toEqual({
      topic: "t",
      result: "R",
      _meta: { source: src(0, "out") },
      _msgid: "m1",
    });
  });
});

describe("context modes — per-port resolution on multi-output nodes", () => {
  it("resolves each port independently (merge on 0, reset on 1)", async () => {
    const { node } = await createNode(CtxMulti, {
      config: { outputContextModes: { 0: "merge", 1: "reset" } },
    });
    await node.receive({ k: 1, _msgid: "m1" });

    expect(node.sent("out0")[0]).toEqual({
      k: 1, // merge: the record accumulates
      a: "A",
      _meta: { source: src(0, "out0") },
      _msgid: "m1",
    });
    expect(node.sent("out1")[0]).toEqual({
      b: "B", // reset: a fresh record
      _meta: { source: src(1, "out1") },
      _msgid: "m1",
    });
  });

  it("a port the config does not set falls back to merge", async () => {
    const { node } = await createNode(CtxMulti, {
      config: { outputContextModes: { 0: "reset" } },
    });
    await node.receive({ k: 1, _msgid: "m1" });

    expect(node.sent("out0")[0]).toEqual({
      a: "A", // reset (configured)
      _meta: { source: src(0, "out0") },
      _msgid: "m1",
    });
    expect(node.sent("out1")[0]).toEqual({
      k: 1, // merge (the unset default)
      b: "B",
      _meta: { source: src(1, "out1") },
      _msgid: "m1",
    });
  });

  it("a named-port send resolves the port's INDEX for the mode lookup", async () => {
    // "failure" is index 1; `outputContextModes` is keyed by index, so { 1: … }
    // is the entry that governs it.
    const { node } = await createNode(CtxNamed, {
      config: { outputContextModes: { 1: "reset" } },
    });
    await node.receive({ traceId: "x", _msgid: "m1" });

    expect(node.sent("failure")[0]).toEqual({
      ok: false, // reset: the traceId is NOT carried
      _meta: { source: src(1, "failure") },
      _msgid: "m1",
    });
  });

  it("a named-port send on an unconfigured index merges", async () => {
    // config sets port 0 (success); the send goes to port 1 (failure) → merge.
    const { node } = await createNode(CtxNamed, {
      config: { outputContextModes: { 0: "reset" } },
    });
    await node.receive({ traceId: "x", _msgid: "m1" });

    expect(node.sent("failure")[0]).toEqual({
      traceId: "x", // carried — the failure port resolved to merge
      ok: false,
      _meta: { source: src(1, "failure") },
      _msgid: "m1",
    });
  });
});
