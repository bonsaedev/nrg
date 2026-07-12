import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { type Schema, SchemaType, defineSchema } from "@bonsae/nrg/schema";

// Named-ports output topology — the two `Port`-typed keys ("success"/"failure")
// stamp two named output ports, so the editor labels them without guessing. The
// input port comes from the `Input` type.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "router-node:configs" },
);
type Config = Infer<typeof ConfigSchema>;
type RouterInput = Input<Port<Record<string, unknown>>>;
type RouterOutput = Outputs<{
  success: Port<unknown>;
  failure: Port<unknown>;
}>;

export default class RouterNode extends IONode<
  Config,
  never,
  RouterInput,
  RouterOutput
> {
  static override readonly type = "router-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = ConfigSchema;

  async input(msg: RouterInput) {
    this.send("success", msg);
  }
}
