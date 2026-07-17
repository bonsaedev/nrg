import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Emits `count` messages on its single output port. One input and one output port
// come from the generics.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "repeater:config" },
);

type Config = Infer<typeof ConfigSchema>;
type RepeaterInput = Input<Port<{ count: number }>>;
type RepeaterOutputs = Outputs<{ out: Port<{ i: number }> }>;

class Repeater extends IONode<Config, never, RepeaterInput, RepeaterOutputs> {
  static override readonly type = "repeater";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: RepeaterInput) {
    const count = msg.count;
    for (let i = 0; i < count; i++) this.send("out", { i });
  }
}

export default Repeater;
