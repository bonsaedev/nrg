import { describe, it, expect } from "vitest";
import { createNode } from "@/test/server/unit";
import { defineIONode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/server/schemas";

// Every node has a return key ("output" by default) whether or not it
// declares returnProperty — declaring it only lets the flow author override
// the key in the editor.
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
      returnProperty: SchemaType.ReturnProperty(),
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
      | "nest"
      | "carry"
      | "reset"
      | undefined;
    this.send("R", mode);
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
      input: { topic: "orders", correlationId: "c1", value: 21 },
    });
  });

  it("keeps the overwritten output recoverable under input", async () => {
    const { node } = await createNode(PlainNode);
    // the incoming message already has an output the result will overwrite
    await node.receive({ output: "previous", value: 5 });

    const out = node.sent(0)[0] as Record<string, any>;
    expect(out.output).toEqual({ doubled: 10 });
    expect(out.input.output).toBe("previous"); // not lost
  });

  it("accumulates input across hops (provenance chain)", async () => {
    const { node } = await createNode(PlainNode);
    // simulate an upstream node that already nested its own input
    await node.receive({
      value: 5,
      input: { value: 3, output: "oldest" },
    });

    expect(node.sent(0)[0]).toEqual({
      value: 5,
      output: { doubled: 10 },
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
      input: { topic: "list", size: 2 },
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
      input: { size: 1 },
    });
  });

  it("uses the flow-configured key override when declared", async () => {
    const { node } = await createNode(OverridableNode, {
      config: { returnProperty: "result" },
    });
    await node.receive({ value: 5, keep: true });

    expect(node.sent(0)[0]).toEqual({
      value: 5,
      keep: true,
      result: { doubled: 10 },
      input: { value: 5, keep: true },
    });
  });

  it("supports a node-defined default key", async () => {
    const CustomDefault = defineIONode({
      type: "assign-custom-default",
      configSchema: defineSchema(
        {
          name: SchemaType.String({ default: "" }),
          returnProperty: SchemaType.ReturnProperty({ default: "data" }),
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

    expect(node.sent(0)[0]).toEqual({ a: 1, data: "ok", input: { a: 1 } });
  });

  it("falls back to output when the configured key is empty", async () => {
    const { node } = await createNode(OverridableNode, {
      config: { returnProperty: "   " },
    });
    await node.receive({ value: 1 });

    expect(node.sent(0)[0]).toEqual({
      value: 1,
      output: { doubled: 2 },
      input: { value: 1 },
    });
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
    expect(out0).toEqual({ keep: 1, output: "first", input: { keep: 1 } });
    expect(node.sent(1)).toEqual([]);

    // mutating a slot's top-level object must not affect anything else
    out0.keep = 999;
    expect(node.sent(0)[0]).toEqual({
      keep: 999,
      output: "first",
      input: { keep: 1 },
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
      input: { traceId: "x" },
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
      input: { value: 4, extra: "kept" },
    });
  });

  it("wraps late async sends with the most recent input", async () => {
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
      input: { seq: 2 },
    });
  });

  it("rejects invalid configured keys at construction", async () => {
    for (const bad of ["my key", "1abc", "a.b", "a-b"]) {
      await expect(
        createNode(OverridableNode, { config: { returnProperty: bad } }),
      ).rejects.toThrow(/Invalid returnProperty key/);
    }
  });
});
