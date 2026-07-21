import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { createNode } from "@/sdk/test/server/unit";
import { IONode, type Input, type Port } from "@/sdk/lib/server";
import ConstNode from "../fixtures/message-model/const-node";
import Echo from "../fixtures/message-model/echo";
import Completer from "../fixtures/message-model/completer";
import Thrower from "../fixtures/message-model/thrower";

// THE MESSAGE MODEL — the executable spec of the flat accumulating record.
//
// The message is the flow's shared record: `send(port, additions)` MERGES an
// object of named fields onto the incoming record, so a field produced by an
// early node is readable by a late node — nothing is silently lost across hops.
// Framework metadata stays off the typed data surface: provenance rides the `_meta`
// root key (read as `msg._meta.source`) and the lineage id rides `_msgid`.

// A data-port `source`: node identity + the port index and resolved port name.
const src = (port: number, portName: string) => ({
  id: expect.any(String),
  type: expect.any(String),
  name: expect.any(String),
  port,
  portName,
});

// The fixture nodes are TYPES-ONLY; point the topology extractor at their tree so
// createNode stamps real ports (named "out" + the built-in error/complete slots).
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/message-model", import.meta.url),
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

describe("message model — the outgoing record", () => {
  it("merge (default): additions merge onto the incoming record; _meta carries provenance", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ topic: "t" });

    // No `output` key, no root `source`, no `input` frame — the record IS the
    // message: carried incoming fields + this send's additions + `_meta`.
    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      result: "R",
      _meta: { source: src(0, "out") },
    });
  });

  it("provenance is read off the _meta root key, typed", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ topic: "t" });

    const frame = node.sent("out")[0];
    expect(frame._meta.source).toMatchObject({ port: 0, portName: "out" });
    // the provenance rides an enumerable root key (clone-safe, framework-owned):
    expect(Object.keys(frame)).toContain("_meta");
  });

  it("preserves the incoming _msgid on the outgoing record", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ topic: "t", _msgid: "m-1" });

    expect(node.sent(0)[0]).toMatchObject({ _msgid: "m-1" });
  });

  it("rejects a scalar or array send — additions are NAMED fields", async () => {
    // A TYPED port already rejects this at compile time; the runtime guard is
    // for JS authors and untyped (Port<unknown>) ports — like ConstNode's.
    const { node } = await createNode(ConstNode);

    expect(() => node.send("out", "bare-string")).toThrow(
      /OBJECT of named fields/,
    );
    expect(() => node.send("out", [1, 2, 3])).toThrow(/OBJECT of named fields/);
  });

  it("send(port) with no value emits the provenance-stamped record unchanged", async () => {
    const { node } = await createNode(ConstNode);
    // outside an input() there is no incoming record — the emission is just _meta
    node.send("out");
    expect(node.sent("out")[0]).toEqual({ _meta: { source: src(0, "out") } });
  });
});

describe("message model — accumulation across nodes", () => {
  it("a field produced two hops back is still on the record at the reader", async () => {
    const { node: a } = await createNode(ConstNode);
    const { node: b } = await createNode(Echo);

    // trigger → A (adds `result`) → B (adds `seen`), shuttled as a wire would
    await a.receive({ topic: "from-trigger", _msgid: "m-3" });
    const frameA = a.sent("out")[0];
    expect(frameA).toMatchObject({ topic: "from-trigger", result: "R" });

    await b.receive({
      topic: "from-trigger",
      result: "R",
      value: "V",
      _msgid: "m-3",
    });
    const frameB = b.sent("out")[0];
    // the trigger's field (2 hops), A's field (1 hop) and B's addition coexist:
    expect(frameB).toMatchObject({
      topic: "from-trigger",
      result: "R",
      seen: "V",
    });
    // _meta always names the IMMEDIATE producer — B, not A:
    expect(frameB._meta.source?.type).toBe("message-model-echo");
  });

  it("same-name addition overwrites the carried field — enrichment, last writer wins", async () => {
    const { node } = await createNode(Echo);
    // the incoming record already has `seen`; Echo's addition replaces it
    await node.receive({ value: "new", seen: "stale" });

    expect(node.sent("out")[0]).toMatchObject({ seen: "new" });
  });
});

describe("message model — lifecycle frames follow the same merge rule", () => {
  it("complete: the processed record plus input()'s returned fields", async () => {
    const { node } = await createNode(Completer, {
      config: { completePort: true },
    });
    await node.receive({ value: 7, _msgid: "m-4" });

    expect(node.sent("complete")[0]).toMatchObject({
      value: 7, // the processed record, carried
      done: 7, // the returned field, merged
      _meta: { source: { portName: "complete" } },
      _msgid: "m-4",
    });
  });

  it("a non-object input() return is a loud authoring error (not an error-port frame)", async () => {
    type ScalarInput = Input<Port<{ value?: unknown }>>;
    class ScalarReturn extends IONode<
      never,
      never,
      Input<Port<{ value?: unknown }>>,
      never
    > {
      static override readonly type = "message-model-scalar-return";
      override async input(_msg: ScalarInput) {
        return 42 as unknown as object; // simulate a JS author returning a scalar
      }
    }
    const { node } = await createNode(ScalarReturn, {
      config: { completePort: true, errorPort: true },
    });

    await expect(node.receive({ value: 1 })).rejects.toThrow(/plain OBJECT/);
    expect(node.sent("error")).toHaveLength(0); // framework misuse never routes there
  });

  it("error: the processed record plus the error block", async () => {
    const { node } = await createNode(Thrower, {
      config: { errorPort: true },
    });
    await node.receive({ value: "v", _msgid: "m-5" });

    expect(node.sent("error")[0]).toMatchObject({
      value: "v", // the record that failed, carried for the handler
      error: { name: "Error", message: "boom" },
      _meta: { source: { portName: "error" } },
      _msgid: "m-5",
    });
  });
});
