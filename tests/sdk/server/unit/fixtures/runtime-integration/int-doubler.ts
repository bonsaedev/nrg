import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only IO node: its one input and one output port come from the generics,
// NOT from an inputSchema/outputsSchema (there are none). Doubles msg.value.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "int-doubler:config" },
);

type Config = Infer<typeof ConfigSchema>;
type IntDoublerInput = Input<Port<{ value: number }>>;
type IntDoublerOutputs = Outputs<{ out: Port<{ doubled: number }> }>;

class IntDoubler extends IONode<
  Config,
  Record<string, never>,
  IntDoublerInput,
  IntDoublerOutputs
> {
  static override readonly type = "int-doubler";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: IntDoublerInput) {
    this.send("out", { doubled: msg.value * 2 });
  }
}

export default IntDoubler;
