import { IONode, type Infer } from "@bonsae/nrg/server";
import { SchemaType, type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema, CredentialsSchema } from "@/schemas/test-node";

type Config = Infer<typeof ConfigsSchema>;
type Credentials = Infer<typeof CredentialsSchema>;

export default class TestNode extends IONode<Config, Credentials> {
  static override readonly type = "test-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly credentialsSchema: Schema = CredentialsSchema;
  static override readonly inputSchema: Schema = SchemaType.Object({});
  static override readonly outputsSchema: Schema = SchemaType.Object({});

  async input(msg: any) {
    this.send(msg);
  }
}
