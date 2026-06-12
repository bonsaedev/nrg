import { describe, it, expect } from "vitest";
import { createNode } from "@/test/server/unit";
import { defineIONode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/server/schemas";

// Every node has a return key ("output" by default) whether or not it
// declares outputReturnProperties — declaring it only lets the flow author set
// a custom key per output port in the editor.
const PlainNode = defineIONode({
  type: "assign-plain",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "assign-plain:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input(msg) {
    this.send({ doubled: (msg as Record<string, number>).value * 2 });
  },
});

const OverridableNode = defineIONode({
  type: "assign-overridable",
  configSchema: defineSchema(
    {
      name: SchemaType.String({ default: "" }),
      outputReturnProperties: SchemaType.OutputReturnProperties(),
    },
    { $id: "assign-overridable:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input(msg) {
    this.send({ doubled: (msg as Record<string, number>).value * 2 });
  },
});

const ArrayResultNode = defineIONode({
  type: "assign-array-result",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "assign-array-result:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Any(),
  async input(msg) {
    const size = (msg as Record<string, unknown>).size as number;
    this.send(Array.from({ length: size }, (_, i) => ({ id: i })));
  },
});

// Sends a fixed result using the context mode named on the incoming message.
const ModeNode = defineIONode({
  type: "assign-mode",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "assign-mode:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Any(),
  async input(msg) {
    const mode = (msg as Record<string, unknown>).mode as
      | "carry"
      | "trace"
      | "reset"
      | undefined;
    this.send("R", { defaultMode: mode });
  },
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
    const { node } = await createNode(ModeNode);
    // the incoming message already has an output the result will overwrite
    await node.receive({ output: "previous", value: 5, mode: "trace" });

    const out = node.sent(0)[0] as Record<string, any>;
    expect(out.output).toBe("R");
    expect(out.input.output).toBe("previous"); // not lost
  });

  it("trace accumulates input across hops (provenance chain)", async () => {
    const { node } = await createNode(ModeNode);
    // simulate an upstream node that already nested its own input
    await node.receive({
      value: 5,
      mode: "trace",
      input: { value: 3, output: "oldest" },
    });

    expect(node.sent(0)[0]).toEqual({
      value: 5,
      mode: "trace",
      output: "R",
      input: {
        value: 5,
        mode: "trace",
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

  it("treats arrays as the value when validateOutput is enabled", async () => {
    const ValidatedArray = defineIONode({
      type: "assign-validated-array",
      configSchema: defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "assign-validated-array:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Any(),
      validateOutput: true,
      async input(msg) {
        const size = (msg as Record<string, unknown>).size as number;
        this.send(Array.from({ length: size }, (_, i) => ({ id: i })));
      },
    });
    const { node } = await createNode(ValidatedArray);
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
    const CustomDefault = defineIONode({
      type: "assign-custom-default",
      configSchema: defineSchema(
        {
          name: SchemaType.String({ default: "" }),
          outputReturnProperties: SchemaType.OutputReturnProperties({
            default: { 0: "data" },
          }),
        },
        { $id: "assign-custom-default:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      async input() {
        this.send("ok");
      },
    });

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
    const MultiReturn = defineIONode({
      type: "assign-multi-return",
      configSchema: defineSchema(
        {
          name: SchemaType.String({ default: "" }),
          outputReturnProperties: SchemaType.OutputReturnProperties(),
        },
        { $id: "assign-multi-return:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: [SchemaType.Any(), SchemaType.Any()],
      async input() {
        this.send(["A", "B"] as never);
      },
    });

    const { node } = await createNode(MultiReturn, {
      // port 0 -> "ok", port 1 unset -> "output"
      config: { outputReturnProperties: { 0: "ok" } },
    });
    await node.receive({ k: 1 });

    expect(node.sent(0)[0]).toEqual({ k: 1, ok: "A" });
    expect(node.sent(1)[0]).toEqual({ k: 1, output: "B" });
  });

  it("wraps each slot of a multi-port send without sharing the top-level object", async () => {
    const MultiNode = defineIONode({
      type: "assign-multi",
      configSchema: defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "assign-multi:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: [SchemaType.Object({}), SchemaType.Object({})],
      async input() {
        this.send(["first", null, "ignored-extra"] as never);
      },
    });

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
    const NamedNode = defineIONode({
      type: "assign-named",
      configSchema: defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "assign-named:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: {
        success: SchemaType.Object({}),
        failure: SchemaType.Object({}),
      },
      async input() {
        this.sendToPort("success", { ok: true });
      },
    });

    const { node } = await createNode(NamedNode);
    await node.receive({ traceId: "x" });

    expect(node.sent("success")[0]).toEqual({
      traceId: "x",
      output: { ok: true },
    });
  });

  it("carry mode keeps context flowing without nesting", async () => {
    const { node } = await createNode(ModeNode);
    await node.receive({ topic: "t", mode: "carry" });

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      mode: "carry",
      output: "R",
    });
  });

  it("carry mode forwards an existing input untouched", async () => {
    const { node } = await createNode(ModeNode);
    await node.receive({ mode: "carry", input: { output: "upstream" } });

    expect(node.sent(0)[0]).toEqual({
      mode: "carry",
      output: "R",
      input: { output: "upstream" }, // carried forward, not re-nested
    });
  });

  it("carry keeps a looped message flat across many hops", async () => {
    // The motivating case: a delay-loop feeds each send back in as the next
    // input. Under carry the message must not grow an `input` chain hop to hop
    // (trace would nest one frame per tick and bloat unboundedly).
    const { node } = await createNode(ModeNode);
    let msg: Record<string, unknown> = { topic: "tick", mode: "carry" };
    for (let i = 0; i < 5; i++) {
      await node.receive(msg);
      msg = node.sent(0).at(-1) as Record<string, unknown>;
    }

    expect(msg).toEqual({ topic: "tick", mode: "carry", output: "R" });
    expect("input" in msg).toBe(false);
  });

  it("trace mode nests the input under input", async () => {
    const { node } = await createNode(ModeNode);
    await node.receive({ topic: "t", mode: "trace" });

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      mode: "trace",
      output: "R",
      input: { topic: "t", mode: "trace" },
    });
  });

  it("reset mode drops all inherited context", async () => {
    const { node } = await createNode(ModeNode);
    await node.receive({ topic: "t", mode: "reset", input: { a: 1 } });

    expect(node.sent(0)[0]).toEqual({ output: "R" });
  });

  it("built-in complete/error ports carry input but not the return key", async () => {
    const BuiltinNode = defineIONode({
      type: "assign-builtin",
      configSchema: defineSchema(
        {
          name: SchemaType.String({ default: "" }),
          errorPort: SchemaType.Boolean({ default: false }),
          completePort: SchemaType.Boolean({ default: false }),
        },
        { $id: "assign-builtin:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      async input(msg) {
        if ((msg as Record<string, unknown>).boom) {
          throw new Error("kaboom");
        }
        this.send("fine");
      },
    });

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
    const ValidatedNode = defineIONode({
      type: "assign-validated",
      configSchema: defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "assign-validated:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object(
        { doubled: SchemaType.Number() },
        { $id: "assign-validated:output" },
      ),
      validateOutput: true,
      async input(msg) {
        this.send({ doubled: (msg as { value: number }).value * 2 });
      },
    });

    const { node } = await createNode(ValidatedNode);
    // raw value { doubled: number } passes the schema even though the
    // wrapped message has extra top-level props the schema doesn't know
    await node.receive({ value: 4, extra: "kept" });
    expect(node.sent(0)[0]).toEqual({
      value: 4,
      extra: "kept",
      output: { doubled: 8 },
    });
  });

  it("late async sends carry the most recent input message", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const LateNode = defineIONode({
      type: "assign-late",
      configSchema: defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "assign-late:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      async input(msg) {
        if ((msg as Record<string, unknown>).fire) {
          void gate.then(() => this.send("late"));
        }
      },
    });

    const { node } = await createNode(LateNode);
    await node.receive({ fire: true, seq: 1 });
    await node.receive({ seq: 2 });
    release();
    await new Promise((resolve) => setImmediate(resolve));

    expect(node.sent(0)[0]).toEqual({
      seq: 2,
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
    const Node = defineIONode({
      type: "assign-pp-validate",
      configSchema: defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "assign-pp-validate:config" },
      ),
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object(
        { n: SchemaType.Number() },
        { $id: "assign-pp-validate:out" },
      ),
      async input(msg) {
        this.send({ n: (msg as Record<string, unknown>).n } as never);
      },
    });

    // no per-port flag -> a bad value passes through unvalidated
    const a = await createNode(Node);
    await a.node.receive({ n: "bad" });
    expect(a.node.sent(0)[0]).toEqual({ n: "bad", output: { n: "bad" } });

    // validateOutputs[0] = true -> the bad value is rejected
    const b = await createNode(Node, {
      config: { validateOutputs: { 0: true } },
    });
    await expect(b.node.receive({ n: "bad" })).rejects.toThrow();
  });
});

// The flow author's per-port `contextModes` config (written by the editor)
// overrides the node author's `defaultMode`. Resolution precedence is
// config override -> defaultMode -> "carry".
describe("context-mode per-port config overrides", () => {
  // Multi-output node: one value per port, so each port's resolved mode can be
  // asserted independently. Author default is "reset".
  const MultiModeNode = defineIONode({
    type: "ctx-multi",
    configSchema: defineSchema(
      { name: SchemaType.String({ default: "" }) },
      { $id: "ctx-multi:config" },
    ),
    inputSchema: SchemaType.Object({}),
    outputsSchema: [SchemaType.Any(), SchemaType.Any()],
    async input() {
      this.send(["A", "B"] as never, { defaultMode: "reset" });
    },
  });

  // Named-output node: sends to "failure" (index 1) with author default "reset".
  const NamedModeNode = defineIONode({
    type: "ctx-named",
    configSchema: defineSchema(
      { name: SchemaType.String({ default: "" }) },
      { $id: "ctx-named:config" },
    ),
    inputSchema: SchemaType.Object({}),
    outputsSchema: { success: SchemaType.Any(), failure: SchemaType.Any() },
    async input() {
      this.sendToPort("failure", { ok: false }, { defaultMode: "reset" });
    },
  });

  it("a configured port overrides the node author's defaultMode", async () => {
    // ModeNode sends with defaultMode = msg.mode ("reset"); config forces trace
    const { node } = await createNode(ModeNode, {
      config: { contextModes: { 0: "trace" } },
    });
    await node.receive({ topic: "t", mode: "reset" });

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      mode: "reset",
      output: "R",
      input: { topic: "t", mode: "reset" }, // trace won over reset
    });
  });

  it("a configured port overrides the carry floor when no defaultMode is given", async () => {
    const { node } = await createNode(ModeNode, {
      config: { contextModes: { 0: "trace" } },
    });
    await node.receive({ topic: "t" }); // no mode -> defaultMode undefined

    expect(node.sent(0)[0]).toEqual({
      topic: "t",
      output: "R",
      input: { topic: "t" }, // trace won over the carry default
    });
  });

  it("an unconfigured port falls back to the node author's defaultMode", async () => {
    // config sets port 1, but ModeNode sends to port 0
    const { node } = await createNode(ModeNode, {
      config: { contextModes: { 1: "trace" } },
    });
    await node.receive({ topic: "t", mode: "reset" });

    expect(node.sent(0)[0]).toEqual({ output: "R" }); // reset (defaultMode)
  });

  it("resolves each port independently on a multi-output node", async () => {
    const { node } = await createNode(MultiModeNode, {
      config: { contextModes: { 0: "trace", 1: "carry" } },
    });
    await node.receive({ k: 1 });

    expect(node.sent(0)[0]).toEqual({ k: 1, output: "A", input: { k: 1 } }); // trace
    expect(node.sent(1)[0]).toEqual({ k: 1, output: "B" }); // carry
  });

  it("falls back to defaultMode on ports the config does not set (multi-output)", async () => {
    const { node } = await createNode(MultiModeNode, {
      config: { contextModes: { 0: "trace" } },
    });
    await node.receive({ k: 1 });

    expect(node.sent(0)[0]).toEqual({ k: 1, output: "A", input: { k: 1 } }); // trace
    expect(node.sent(1)[0]).toEqual({ output: "B" }); // reset (defaultMode)
  });

  it("sendToPort resolves the named port's index for the override", async () => {
    // "failure" is index 1; config sets port 1 to trace
    const { node } = await createNode(NamedModeNode, {
      config: { contextModes: { 1: "trace" } },
    });
    await node.receive({ traceId: "x" });

    expect(node.sent("failure")[0]).toEqual({
      traceId: "x",
      output: { ok: false },
      input: { traceId: "x" },
    });
  });

  it("sendToPort falls back to defaultMode when the named port is unconfigured", async () => {
    // config sets port 0 (success); the send goes to port 1 (failure)
    const { node } = await createNode(NamedModeNode, {
      config: { contextModes: { 0: "trace" } },
    });
    await node.receive({ traceId: "x" });

    expect(node.sent("failure")[0]).toEqual({ output: { ok: false } }); // reset
  });
});
