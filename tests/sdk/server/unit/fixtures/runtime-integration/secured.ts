import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Echoes its credentials, to verify they reach the deployed node. One input and
// one output port come from the generics; the credentials schema drives creds.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "secured:config" },
);

const CredentialsSchema = defineSchema(
  { token: SchemaType.String({ default: "" }) },
  { $id: "secured:credentials" },
);

type Config = Infer<typeof ConfigSchema>;
type Credentials = Infer<typeof CredentialsSchema>;
type SecuredInput = Input<Port<{ payload?: unknown }>>;
type SecuredOutputs = Outputs<{ out: Port<{ token: string | undefined }> }>;

class Secured extends IONode<
  Config,
  Credentials,
  SecuredInput,
  SecuredOutputs
> {
  static override readonly type = "secured";
  static override readonly configSchema = ConfigSchema;
  static override readonly credentialsSchema = CredentialsSchema;

  override async input() {
    this.send("out", { token: this.credentials?.token });
  }
}

export default Secured;
