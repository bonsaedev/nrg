import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema, CredentialsSchema } from "@/schemas/test-node";

// No Input/Output generics: an untyped passthrough. Port topology comes solely
// from the generics, so this node declares neither an input nor an output type —
// its built-in error/complete ports are generic over `unknown`.
type Config = Infer<typeof ConfigsSchema>;
type Credentials = Infer<typeof CredentialsSchema>;

export default class TestNode extends IONode<Config, Credentials> {
  static override readonly type = "test-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly credentialsSchema: Schema = CredentialsSchema;

  async input(msg: any) {
    this.send(msg);
  }
}
