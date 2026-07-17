import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Increments a flow-context counter on every message. One input and one output
// port come from the generics.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "counter:config" },
);

type Config = Infer<typeof ConfigSchema>;
type CounterInput = Input<Port<{ payload?: unknown }>>;
type CounterOutputs = Outputs<{ out: Port<{ count: number }> }>;

class Counter extends IONode<Config, never, CounterInput, CounterOutputs> {
  static override readonly type = "counter";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    const n = (await this.context.flow.get<number>("count")) ?? 0;
    await this.context.flow.set("count", n + 1);
    this.send("out", { count: n + 1 });
  }
}

export default Counter;
