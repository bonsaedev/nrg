import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { IONode } from "@/sdk/lib/server/nodes/io-node";
import { init } from "@/sdk/lib/server/init";
import { createRED, createNodeRedNode } from "@mocks/red";
import { createNode } from "@/sdk/test/server/unit";
import {
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
} from "@/sdk/lib/server/symbols";
import SingleOutput from "../fixtures/io-node-test/single-output";
import MultiOutput from "../fixtures/io-node-test/multi-output";
import NamedOutput from "../fixtures/io-node-test/named-output";
import NoOutput from "../fixtures/io-node-test/no-output";

const src = (port: number, portName?: string) => ({
  id: expect.any(String),
  type: expect.any(String),
  name: expect.any(String),
  port,
  ...(portName !== undefined ? { portName } : {}),
});

// The fixture nodes are TYPES-ONLY (no inputSchema/outputsSchema); their port
// topology lives only in the generics. In un-built source there is no
// `__nrgPorts` static, so without the harness's build-equivalent injection a node
// would report 0 ports. Point the extractor at the fixture tree so `createNode`
// stamps the real topology (mirrors port-topology-injection.test.ts).
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/io-node-test", import.meta.url),
);

// A minimal inline node for the low-level plumbing tests (constructor, status,
// updateWires, receive, send-fallback) that don't depend on port topology — 0
// ports is fine. It carries no schema statics: topology and data validation are
// no longer schema-driven.
class TestIONode extends IONode {
  static override readonly type = "test-io-node";
  static override readonly category = "function";
  static override readonly color = "#ffffff" as const;

  public inputCalled = false;
  public lastMsg: any = null;

  public override async input(msg: any) {
    this.inputCalled = true;
    this.lastMsg = msg;
  }
}

// A JSON-Schema string that requires `payload` to be a non-empty string — the
// shape a flow author would set as the config `inputSchema` override.
const NON_EMPTY_PAYLOAD = JSON.stringify({
  type: "object",
  properties: { payload: { type: "string", minLength: 1 } },
  required: ["payload"],
});

// Per-port output schemas (as config JSON strings): port 0 requires a non-empty
// `result`, port 1 a non-empty `error`.
const RESULT_SCHEMA = JSON.stringify({
  type: "object",
  properties: { result: { type: "string", minLength: 1 } },
  required: ["result"],
});
const ERROR_SCHEMA = JSON.stringify({
  type: "object",
  properties: { error: { type: "string", minLength: 1 } },
  required: ["error"],
});

describe("IONode", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  describe("constructor", () => {
    it("should set up context with node, flow, and global", () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      const ctx = (instance as any).context;
      expect(ctx).toBeDefined();
      expect(ctx.node).toBeDefined();
      expect(ctx.flow).toBeDefined();
      expect(ctx.global).toBeDefined();
    });

    it("should support context as a function with scope", async () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      const nodeCtx = (instance as any).context("node");
      expect(nodeCtx).toBeDefined();
      expect(nodeCtx.get).toBeDefined();
      expect(nodeCtx.set).toBeDefined();
      expect(nodeCtx.keys).toBeDefined();
    });
  });

  describe("properties", () => {
    it("should expose x, y, g, wires from underlying node", () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      expect(instance.x).toBe(100);
      expect(instance.y).toBe(200);
      expect(instance.g).toBe("group-1");
      expect(instance.wires).toEqual([["node-2"]]);
    });
  });

  describe("outputPortNames (static)", () => {
    // The static getters read the build-injected topology (`__nrgPorts`), which
    // the harness stamps from each fixture's generics. There is no schema
    // fallback: port count/names come from the TS types alone.
    it("returns the names + counts for a named-port record output", async () => {
      await createNode(NamedOutput);
      expect(NamedOutput.outputPortNames).toEqual(["ok", "err"]);
      expect(NamedOutput.outputs).toBe(2);
      expect(NamedOutput.inputs).toBe(1);
    });

    it("returns the single name for a one-key record output", async () => {
      // Named-always: a single output is a one-key `Port<T>` record, so it still
      // has a name ("out") — there is no unnamed/positional single port.
      await createNode(SingleOutput);
      expect(SingleOutput.outputPortNames).toEqual(["out"]);
      expect(SingleOutput.outputs).toBe(1);
    });

    it("returns the names for a multi-key record output", async () => {
      // A multi-output is likewise a `Port<T>` record (out0/out1) — every port
      // is named; there is no positional tuple form.
      await createNode(MultiOutput);
      expect(MultiOutput.outputPortNames).toEqual(["out0", "out1"]);
      expect(MultiOutput.outputs).toBe(2);
    });

    it("is undefined for no output", async () => {
      await createNode(NoOutput);
      expect(NoOutput.outputPortNames).toBeUndefined();
      expect(NoOutput.outputs).toBe(0);
    });
  });

  describe("input handling", () => {
    it("should call input method with message", async () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      // Wire up event handlers
      const createdPromise = Promise.resolve();
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "test" }, send, done);

      expect(instance.inputCalled).toBe(true);
      expect(instance.lastMsg).toEqual({ payload: "test" });
    });

    it("validates input when validateInput is true and an inputSchema is set", async () => {
      const { node } = await createNode(SingleOutput, {
        config: { validateInput: true, inputSchema: NON_EMPTY_PAYLOAD },
      });

      // Validation runs before input(); an empty payload rejects.
      await expect(node.receive({ payload: "" })).rejects.toBeInstanceOf(Error);
    });

    it("does not validate input when validateInput is false", async () => {
      const { node } = await createNode(SingleOutput, {
        config: { validateInput: false, inputSchema: NON_EMPTY_PAYLOAD },
      });

      // Validation is off, so the same message passes straight through.
      await expect(node.receive({ payload: "" })).resolves.toBeUndefined();
    });

    it("warns once and skips validation on an unusable schema override", async () => {
      // Valid JSON, but the `$ref` can't be resolved so it does not COMPILE.
      // There is no static schema to fall back to anymore: the bad override is
      // ignored (warned exactly once, then memoized) and messages pass through
      // unvalidated — the node must NOT throw on every message.
      const { node } = await createNode(SingleOutput, {
        config: {
          validateInput: true,
          inputSchema: JSON.stringify({ $ref: "#/$defs/missing" }),
        },
      });

      await expect(node.receive({ payload: "" })).resolves.toBeUndefined();
      await expect(node.receive({ payload: "" })).resolves.toBeUndefined();

      const overrideWarnings = node
        .warned()
        .filter((w) => String(w).includes("invalid data-validation schema"));
      expect(overrideWarnings).toHaveLength(1);
    });
  });

  describe("send", () => {
    it("uses the send callback when inside the input handler", async () => {
      const { node } = await createNode(SingleOutput);

      await node.receive({ payload: "result" });

      // Every send wraps the value under the return key (default "output") and is
      // delivered as a positional array (one slot per port) via the invocation's
      // send callback while inside input(). carry (the default mode) keeps the
      // incoming message under `input`. The node emits to its named port "out", so
      // `source` carries the resolved `portName`.
      expect(node.sent(0)).toEqual([
        {
          output: "result",
          source: src(0, "out"),
          input: { payload: "result" },
        },
      ]);
    });

    it("should fall back to node.send outside input handler", () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.send(0, "test");
      // A topology-less node reports `inputs === 0` (the framework's default), so
      // it's treated as a source/trigger: the send mints a `_msgid` (to key the
      // frozen `transactionId`) instead of leaving it for Node-RED to assign.
      expect(node.send).toHaveBeenCalledWith([
        { output: "test", source: src(0), _msgid: expect.any(String) },
      ]);
    });

    it("validates per-port with a schema per output port", async () => {
      const { node } = await createNode(MultiOutput, {
        config: {
          validateOutputs: { 0: true, 1: true },
          outputSchemas: { 0: RESULT_SCHEMA, 1: ERROR_SCHEMA },
        },
      });

      // Valid: first port has data, second is null (skipped).
      expect(() => {
        node.send("out0", { result: "ok" });
        node.send("out1", null);
      }).not.toThrow();

      // Invalid: first port has an empty result.
      expect(() => {
        node.send("out0", { result: "" });
        node.send("out1", null);
      }).toThrow();
    });

    it("validates output against the config.outputSchemas override", async () => {
      // The config override is strict, so an invalid value throws and a valid one
      // passes.
      const { node } = await createNode(SingleOutput, {
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

      // single output port → the raw value is the port-0 value.
      expect(() => node.send("out", { n: 1 })).not.toThrow();
      expect(() => node.send("out", { wrong: "x" })).toThrow();
    });

    it("honors a per-port validateOutputs map", async () => {
      const { node } = await createNode(MultiOutput, {
        config: {
          // port 0 unchecked, port 1 validated
          validateOutputs: { 0: false, 1: true },
          outputSchemas: { 0: RESULT_SCHEMA, 1: ERROR_SCHEMA },
        },
      });

      // Port 0 off: an invalid value passes through unvalidated.
      expect(() => {
        node.send("out0", { result: "" });
        node.send("out1", null);
      }).not.toThrow();
      // Port 1 on: an invalid value throws.
      expect(() => {
        node.send("out0", null);
        node.send("out1", { error: "" });
      }).toThrow();
      // Port 1 valid passes.
      expect(() => {
        node.send("out0", null);
        node.send("out1", { error: "boom" });
      }).not.toThrow();
    });

    it("does not validate a port absent from the validateOutputs map", async () => {
      const { node } = await createNode(MultiOutput, {
        config: {
          // only port 0 declared; port 1 has no entry -> not validated
          validateOutputs: { 0: true },
          outputSchemas: { 0: RESULT_SCHEMA, 1: ERROR_SCHEMA },
        },
      });

      // Port 0 is validated.
      expect(() => {
        node.send("out0", { result: "" });
        node.send("out1", null);
      }).toThrow();
      // Port 1 has no flag entry -> not validated.
      expect(() => {
        node.send("out0", null);
        node.send("out1", { error: "" });
      }).not.toThrow();
    });

    it("validates an array sent from a single-output node as the value", async () => {
      // A single-output node treats an array argument as the value (not as
      // per-port messages), so the schema describes the array itself.
      const { node } = await createNode(SingleOutput, {
        config: {
          validateOutputs: { 0: true },
          outputSchemas: {
            0: JSON.stringify({
              type: "array",
              items: { type: "string", minLength: 1 },
            }),
          },
        },
      });

      // Valid: the array value matches the array schema.
      expect(() => node.send("out", ["a", "b"])).not.toThrow();
      // Invalid: an element fails the item schema.
      expect(() => node.send("out", ["a", ""])).toThrow();
    });

    it("should validate output when validateOutputs is on", async () => {
      const { node } = await createNode(SingleOutput, {
        config: {
          validateOutputs: { 0: true },
          outputSchemas: { 0: RESULT_SCHEMA },
        },
      });

      expect(() => node.send("out", { result: "" })).toThrow();
    });

    it("lets an empty subschema carry non-data values past validation", async () => {
      // Non-data ports (a function, class instance, Buffer, stream, connection)
      // can't be JSON-validated. An empty `{}` subschema passes any runtime value
      // through — while sibling data fields are still checked.
      const { node } = await createNode(SingleOutput, {
        config: {
          validateOutputs: { 0: true },
          outputSchemas: {
            0: JSON.stringify({
              type: "object",
              properties: {
                handler: {},
                name: { type: "string", minLength: 1 },
              },
              required: ["handler", "name"],
            }),
          },
        },
      });

      // The function in the empty-schema field passes validation.
      expect(() =>
        node.send("out", { handler: () => {}, name: "ok" }),
      ).not.toThrow();
      // Discriminating: the empty-schema field is exempt, but the sibling data
      // field is still validated — an empty name throws.
      expect(() => node.send("out", { handler: () => {}, name: "" })).toThrow();
    });

    it("validates a named-port send against that port's schema", async () => {
      // send(name, …) is the emission path for named `Port` outputs, so
      // opt-in per-port output validation applies to a named port just like a
      // numeric one.
      const { node } = await createNode(NamedOutput, {
        config: {
          validateOutputs: { 0: true },
          outputSchemas: {
            0: JSON.stringify({
              type: "object",
              properties: { value: { type: "number" } },
              required: ["value"],
            }),
          },
        },
      });

      // Valid → delivered; invalid → throws (which routes to the error port).
      expect(() => node.send("ok", { value: 1 })).not.toThrow();
      expect(() => node.send("ok", { value: "nope" })).toThrow();
    });

    it("catches a configured output-validation failure during input() and reports it", async () => {
      // End-to-end: a flow author enables output validation; the node emits data
      // that fails the schema during input(); the throw is caught by the input
      // handler and surfaced via done(error) — which `receive` re-throws.
      const { node } = await createNode(SingleOutput, {
        config: {
          validateOutputs: { 0: true },
          outputSchemas: {
            0: JSON.stringify({
              type: "object",
              properties: { value: { type: "number" } },
              required: ["value"],
            }),
          },
        },
      });

      await expect(
        node.receive({ payload: { value: "not a number" } }),
      ).rejects.toBeInstanceOf(Error);
    });

    it("routes send by name via the injected topology (no schema)", async () => {
      // A schema-free node whose named ports come from the Output generic
      // (injected as `__nrgPorts`). send("err") resolves the name through the
      // injected outputNames and delivers to that port — with NO schema to fall
      // back on.
      const { node } = await createNode(NamedOutput);

      node.send("err", { reason: "x" });

      // Delivered as a positional array; "err" resolved to index 1 (index 0
      // empty), wrapped under the default return key.
      expect(node.sent(0)).toHaveLength(0);
      expect(node.sent("err")).toEqual([
        { output: { reason: "x" }, source: src(1, "err") },
      ]);
    });
  });

  describe("status", () => {
    it("should delegate to node.status", () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.status({ fill: "green", shape: "dot", text: "connected" });
      expect(node.status).toHaveBeenCalledWith({
        fill: "green",
        shape: "dot",
        text: "connected",
      });
    });
  });

  describe("updateWires", () => {
    it("should delegate to node.updateWires", () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.updateWires([["a"], ["b"]]);
      expect(node.updateWires).toHaveBeenCalledWith([["a"], ["b"]]);
    });
  });

  describe("receive", () => {
    it("should delegate to node.receive", () => {
      const RED = createRED();
      init(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.receive({ payload: "test" });
      expect(node.receive).toHaveBeenCalledWith({ payload: "test" });
    });
  });
});
