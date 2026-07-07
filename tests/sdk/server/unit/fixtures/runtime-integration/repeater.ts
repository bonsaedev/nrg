import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Emits `count` messages on its single output port. One input and one output port
// come from the generics.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "repeater:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { count: number };
type Output = { i: number };

class Repeater extends IONode<Config, Record<string, never>, Input, Output> {
  static override readonly type = "repeater";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: Input) {
    const count = msg.count;
    for (let i = 0; i < count; i++) this.send({ i });
  }
}

export default Repeater;
