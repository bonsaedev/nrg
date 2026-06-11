import {
  IONode,
  type Schema,
  type Infer,
  SchemaType,
} from "@bonsae/nrg/server";
import { ConfigsSchema, CredentialsSchema } from "../schemas/all-fields-node";

type Config = Infer<typeof ConfigsSchema>;
type Credentials = Infer<typeof CredentialsSchema>;

export default class AllFieldsNode extends IONode<Config, Credentials> {
  static override readonly type = "all-fields-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#c0deed";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly credentialsSchema: Schema = CredentialsSchema;
  static override readonly inputSchema: Schema = SchemaType.Object({});
  static override readonly outputsSchema: Schema = SchemaType.Object({});

  async created() {
    this.status({ fill: "green", shape: "dot", text: "ready" });
  }

  async input(msg: any) {
    this.send(msg);
  }
}
