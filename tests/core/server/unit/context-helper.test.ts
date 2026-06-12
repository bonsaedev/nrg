import { describe, it, expect } from "vitest";
import { createNode } from "@/test/server/unit";
import { defineIONode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/server/schemas";

const Counter = defineIONode({
  type: "ctx-counter",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "ctx-counter:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input() {
    const n = (await this.context.flow.get<number>("count")) ?? 0;
    await this.context.flow.set("count", n + 1);
    this.send({ count: n + 1 });
  },
});

describe("createNode context helper", () => {
  it("presets and asserts flow context", async () => {
    const { node } = await createNode(Counter);

    await node.context.flow!.set("count", 10);

    await node.receive({});

    expect((node.sent()[0] as { output: { count: number } }).output.count).toBe(
      11,
    );
    expect(await node.context.flow!.get("count")).toBe(11);
  });
});
