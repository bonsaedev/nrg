import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";
import PlainNode from "../fixtures/return-property-test/assign-plain";
import OverridableNode from "../fixtures/return-property-test/assign-overridable";
import ArrayResultNode from "../fixtures/return-property-test/assign-array-result";
import ModeNode from "../fixtures/return-property-test/assign-mode";
import ValidatedArray from "../fixtures/return-property-test/assign-validated-array";
import CustomDefault from "../fixtures/return-property-test/assign-custom-default";
import MultiReturn from "../fixtures/return-property-test/assign-multi-return";
import MultiNode from "../fixtures/return-property-test/assign-multi";
import NamedNode from "../fixtures/return-property-test/assign-named";
import BuiltinNode from "../fixtures/return-property-test/assign-builtin";
import ValidatedNode from "../fixtures/return-property-test/assign-validated";
import LateNode, {
  releaseLateGate,
} from "../fixtures/return-property-test/assign-late";
import PpValidateNode from "../fixtures/return-property-test/assign-pp-validate";
import MultiModeNode from "../fixtures/return-property-test/ctx-multi";
import NamedModeNode from "../fixtures/return-property-test/ctx-named";

// The fixture nodes are TYPES-ONLY (no inputSchema/outputsSchema); their port
// topology lives only in their generics. Un-built source carries no `__nrgPorts`
// static, so without the harness's build-equivalent injection they would report 0
// ports and the return-property/context-mode routing would collapse. Point the
// extractor at the fixture tree so createNode stamps the real topology.
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/return-property-test", import.meta.url),
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

describe("returnProperty / output convention", () => {
  it("wraps every send under output by default — no declaration needed", async () => {
    const { node } = await createNode(PlainNode);
    await node.receive({ topic: "orders", correlationId: "c1", value: 21 });

    expect(node.sent(0)[0]).toEqual({
      topic: "orders",
      correlationId: "c1",
      value: 21,
      output: { doubled: 42 },
    });
  });

  it("trace keeps the overwritten output recoverable under input", async () => {
    const { node } = await createNode(ModeNode, {
      config: { outputContextModes: { 0: "trace" } },
    });
    // the incoming message already has an output the result will overwrite
    await node.receive({ output: "previous", value: 5 });

    const out = node.sent(0)[0] as Record<string, any>;
    expect(out.output).toBe("R");
    expect(out.input.output).toBe("previous"); // not lost
  });

  it("trace accumulates input across hops (provenance chain)", async () => {
    const { node } = await createNode(ModeNode, {
      config: { outputContextModes: { 0: "trace" } },
    });
    // simulate an upstream node that already nested its own input
    await node.receive({
      value: 5,
      input: { value: 3, output: "oldest" },
    });

    expect(node.sent(0)[0]).toEqual({
      value: 5,
      output: "R",
      input: {
        value: 5,
        input: { value: 3, output: "oldest" },
      },
    });
  });

  it("treats arrays as the value on single-output nodes (no port fanout)", async () => {
    const { node } = await createNode(ArrayResultNode);
    await node.receive({ topic: "list", size: 2 });

    expect(node.sent(0)).toHaveLength(1);
    expect(node.sent(0)[0]).toEqual({
      topic: "list",
      size: 2,
      output: [{ id: 0 }, { id: 1 }],
    });
  });

  it("treats arrays as the value when output validation is enabled", async () => {
    // Output validation is a framework control: turn on the per-port flag and
    // supply the port's JSON schema via config (no static outputsSchema exists).
    const { node } = await createNode(ValidatedArray, {
      config: {
        validateOutputs: { 0: true },
        outputSchemas: { 0: JSON.stringify({ type: "array" }) },
      },
    });
    await node.receive({ size: 1 });

    expect(node.sent(0)[0]).toEqual({
      size: 1,
      output: [{ id: 0 }],
    });
  });

  it("uses the flow-configured per-port return property when declared", async () => {
    const { node } = await createNode(OverridableNode, {
      config: { outputReturnProperties: { 0: "result" } },
    });
    await node.receive({ value: 5, keep: true });

    expect(node.sent(0)[0]).toEqual({
      value: 5,
      keep: true,
      result: { doubled: 10 },
    });
  });

  it("supports a node-defined default return property per port", async () => {
    const { node } = await createNode(CustomDefault);
    await node.receive({ a: 1 });

    expect(node.sent(0)[0]).toEqual({ a: 1, data: "ok" });
  });

  it("falls back to output when the configured key is empty", async () => {
    const { node } = await createNode(OverridableNode, {
      config: { outputReturnProperties: { 0: "   " } },
    });
    await node.receive({ value: 1 });

    expect(node.sent(0)[0]).toEqual({
      value: 1,
      output: { doubled: 2 },
    });
  });

  it("resolves a custom return property per port on a multi-output node", async () => {
    const { node } = await createNode(MultiReturn, {
      // port 0 -> "ok", port 1 unset -> "output"
      config: { outputReturnProperties: { 0: "ok" } },
    });
    await node.receive({ k: 1 });

    expect(node.sent(0)[0]).toEqual({ k: 1, ok: "A" });
    expect(node.sent(1)[0]).toEqual({ k: 1, output: "B" });
  });

  it("wraps each slot of a multi-port send without sharing the top-level object", async () => {
    const { node } = await createNode(MultiNode);
    await node.receive({ keep: 1 });

    const out0 = node.sent(0)[0] as Record<string, unknown>;
    expect(out0).toEqual({ keep: 1, output: "first" });
    expect(node.sent(1)).toEqual([]);

    // mutating a slot's top-level object must not affect anything else
    out0.keep = 999;
    expect(node.sent(0)[0]).toEqual({
      keep: 999,
      output: "first",
    });
  });

  it("wraps named-port sends", async () => {
    const { node } = await createNode(NamedNode);
    await node.receive({ traceId: "x" });

    expect(node.sent("success")[0]).toEqual({
      traceId: "x",
      output: { ok: true },
    });
  });

  it("carry mode keeps context flowing without nesting", async () => {
    // carry is the fallback when no per-port mode is configured
    const { node } = await createNode(ModeNode);
    await node.receive({ topic: "t" });

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      output: "R",
    });
  });

  it("carry mode forwards an existing input untouched", async () => {
    const { node } = await createNode(ModeNode);
    await node.receive({ input: { output: "upstream" } });

    expect(node.sent(0)[0]).toEqual({
      output: "R",
      input: { output: "upstream" }, // carried forward, not re-nested
    });
  });

  it("carry keeps a looped message flat across many hops", async () => {
    // The motivating case: a delay-loop feeds each send back in as the next
    // input. Under carry the message must not grow an `input` chain hop to hop
    // (trace would nest one frame per tick and bloat unboundedly).
    const { node } = await createNode(ModeNode);
    let msg: Record<string, unknown> = { topic: "tick" };
    for (let i = 0; i < 5; i++) {
      await node.receive(msg);
      msg = node.sent(0).at(-1) as Record<string, unknown>;
    }

    expect(msg).toEqual({ topic: "tick", output: "R" });
    expect("input" in msg).toBe(false);
  });

  it("trace mode nests the input under input", async () => {
    const { node } = await createNode(ModeNode, {
      config: { outputContextModes: { 0: "trace" } },
    });
    await node.receive({ topic: "t" });

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      output: "R",
      input: { topic: "t" },
    });
  });

  it("reset mode drops all inherited context", async () => {
    const { node } = await createNode(ModeNode, {
      config: { outputContextModes: { 0: "reset" } },
    });
    await node.receive({ topic: "t", input: { a: 1 } });

    expect(node.sent(0)[0]).toEqual({ output: "R" });
  });

  it("built-in complete/error ports carry input but not the return key", async () => {
    const { node } = await createNode(BuiltinNode, {
      config: { errorPort: true, completePort: true },
    });

    await node.receive({ id: 1 });
    const complete = node.sent(2)[0] as Record<string, unknown>;
    expect(complete.complete).toBeDefined();
    expect(complete.input).toEqual({ id: 1 }); // lineage carried
    expect(complete.output).toBeUndefined(); // not return-key-wrapped

    try {
      await node.receive({ id: 2, boom: true });
    } catch {
      // the thrown error is expected — it feeds the error port
    }
    const errored = node.sent(1)[0] as Record<string, unknown>;
    expect(errored.error).toMatchObject({ message: "kaboom" });
    expect(errored.input).toEqual({ id: 2, boom: true });
    expect(errored.output).toBeUndefined();
  });

  it("validates the RAW sent value, not the wrapped message", async () => {
    // Enable per-port output validation via config and supply the port schema:
    // the RAW sent value `{ doubled }` is validated, not the wrapped message
    // (whose extra top-level props the schema doesn't know).
    const { node } = await createNode(ValidatedNode, {
      config: {
        validateOutputs: { 0: true },
        outputSchemas: {
          0: JSON.stringify({
            type: "object",
            properties: { doubled: { type: "number" } },
            required: ["doubled"],
            additionalProperties: false,
          }),
        },
      },
    });
    await node.receive({ value: 4, extra: "kept" });
    expect(node.sent(0)[0]).toEqual({
      value: 4,
      extra: "kept",
      output: { doubled: 8 },
    });
  });

  it("a detached async send carries its scheduling input's context", async () => {
    const { node } = await createNode(LateNode);
    // seq:1 schedules the deferred send; seq:2 arrives before the gate fires.
    await node.receive({ fire: true, seq: 1 });
    await node.receive({ seq: 2 });
    releaseLateGate();
    await new Promise((resolve) => setImmediate(resolve));

    // The deferred send belongs to the input that scheduled it (seq:1) — its
    // context is preserved, not replaced by whatever arrived most recently.
    expect(node.sent(0)[0]).toEqual({
      fire: true,
      seq: 1,
      output: "late",
    });
  });

  it("rejects invalid configured return properties at construction", async () => {
    for (const bad of ["my key", "1abc", "a.b", "a-b"]) {
      await expect(
        createNode(OverridableNode, {
          config: { outputReturnProperties: { 0: bad } },
        }),
      ).rejects.toThrow(/Invalid return property/);
    }
  });

  it("validates a port only when its validate flag is on", async () => {
    // no per-port flag -> a bad value passes through unvalidated
    const a = await createNode(PpValidateNode);
    await a.node.receive({ n: "bad" });
    expect(a.node.sent(0)[0]).toEqual({ n: "bad", output: { n: "bad" } });

    // validateOutputs[0] = true (+ a port schema) -> the bad value is rejected
    const b = await createNode(PpValidateNode, {
      config: {
        validateOutputs: { 0: true },
        outputSchemas: {
          0: JSON.stringify({
            type: "object",
            properties: { n: { type: "number" } },
            required: ["n"],
          }),
        },
      },
    });
    await expect(b.node.receive({ n: "bad" })).rejects.toThrow();
  });
});

// The flow author's per-port `outputContextModes` config (a framework control on
// every IONode) selects each port's mode. Resolution falls back to "carry" for
// any port the config does not set.
describe("context-mode per-port resolution", () => {
  it("uses the configured mode for a port", async () => {
    const { node } = await createNode(ModeNode, {
      config: { outputContextModes: { 0: "trace" } },
    });
    await node.receive({ topic: "t" });

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      output: "R",
      input: { topic: "t" }, // trace
    });
  });

  it("falls back to carry on a port the config does not set", async () => {
    // config sets port 1, but ModeNode sends to port 0
    const { node } = await createNode(ModeNode, {
      config: { outputContextModes: { 1: "trace" } },
    });
    await node.receive({ topic: "t" });

    expect(node.sent(0)[0]).toEqual({ topic: "t", output: "R" }); // carry
  });

  it("resolves each port independently on a multi-output node", async () => {
    const { node } = await createNode(MultiModeNode, {
      config: { outputContextModes: { 0: "trace", 1: "reset" } },
    });
    await node.receive({ k: 1 });

    expect(node.sent(0)[0]).toEqual({ k: 1, output: "A", input: { k: 1 } }); // trace
    expect(node.sent(1)[0]).toEqual({ output: "B" }); // reset
  });

  it("falls back to carry on ports the config does not set (multi-output)", async () => {
    const { node } = await createNode(MultiModeNode, {
      config: { outputContextModes: { 0: "trace" } },
    });
    await node.receive({ k: 1 });

    expect(node.sent(0)[0]).toEqual({ k: 1, output: "A", input: { k: 1 } }); // trace
    expect(node.sent(1)[0]).toEqual({ k: 1, output: "B" }); // carry
  });

  it("sendToPort resolves the named port's index for the mode", async () => {
    // "failure" is index 1; config sets port 1 to trace
    const { node } = await createNode(NamedModeNode, {
      config: { outputContextModes: { 1: "trace" } },
    });
    await node.receive({ traceId: "x" });

    expect(node.sent("failure")[0]).toEqual({
      traceId: "x",
      output: { ok: false },
      input: { traceId: "x" },
    });
  });

  it("sendToPort falls back to carry when the named port is unconfigured", async () => {
    // config sets port 0 (success); the send goes to port 1 (failure)
    const { node } = await createNode(NamedModeNode, {
      config: { outputContextModes: { 0: "trace" } },
    });
    await node.receive({ traceId: "x" });

    expect(node.sent("failure")[0]).toEqual({
      traceId: "x",
      output: { ok: false },
    }); // carry
  });
});
