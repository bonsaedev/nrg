import { defineIONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-first node exercising the flow context store via the createNode helper.
// Its one input port and one output port come from the generics passed to
// `defineIONode<Config, Credentials, Input, Output>`, NOT from an
// inputSchema/outputsSchema (those no longer exist).
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "ctx-counter:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { count?: number };
type Output = { count: number };

const Counter = defineIONode<Config, any, Input, Output>({
  type: "ctx-counter",
  configSchema: ConfigSchema,

  async input() {
    const n = (await this.context.flow.get<number>("count")) ?? 0;
    await this.context.flow.set("count", n + 1);
    this.send({ count: n + 1 });
  },
});

export default Counter;
