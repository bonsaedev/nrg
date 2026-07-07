import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/custom-form-node";

type Config = Infer<typeof ConfigsSchema>;

// Port topology comes from the Input/Output generics (the build type-extracts
// them): one input port and one single-object output port.
type Input = Record<string, unknown>;
type Output = Record<string, unknown>;

export default class CustomFormNode extends IONode<
  Config,
  never,
  Input,
  Output
> {
  static override readonly type = "custom-form-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#d8bfd8";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: Input) {
    this.send(msg);
  }
}
