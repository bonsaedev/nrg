import { IONode, type Infer } from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";

// A types-first node exercising the flow context store via the createNode helper.
// Its one input port and one output port come from the class generics
// `IONode<Config, Credentials, Input, Output>`, NOT from a schema.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "ctx-counter:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { count?: number };
type Output = { count: number };

export default class Counter extends IONode<Config, any, Input, Output> {
  static override readonly type = "ctx-counter";
  static override readonly configSchema: Schema = ConfigSchema;

  override async input() {
    const n = (await this.context.flow.get<number>("count")) ?? 0;
    await this.context.flow.set("count", n + 1);
    this.send({ count: n + 1 });
  }
}
