import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema, CredentialsSchema } from "@/schemas/all-fields-node";

type Config = Infer<typeof ConfigsSchema>;
type Credentials = Infer<typeof CredentialsSchema>;

// Port topology comes from the Input/Output generics (the build type-extracts
// them): one input port and one single-object output port.
type Input = Record<string, unknown>;
type Output = Record<string, unknown>;

export default class AllFieldsNode extends IONode<
  Config,
  Credentials,
  Input,
  Output
> {
  static override readonly type = "all-fields-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#c0deed";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly credentialsSchema: Schema = CredentialsSchema;

  async created() {
    this.status({ fill: "green", shape: "dot", text: "ready" });
  }

  async input(msg: Input) {
    this.send(msg);
  }
}
