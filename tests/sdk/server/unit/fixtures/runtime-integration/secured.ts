import { IONode, type Infer } from "@/sdk/lib/server";
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
type Input = { payload?: unknown };
type Output = { token: string | undefined };

class Secured extends IONode<Config, Credentials, Input, Output> {
  static override readonly type = "secured";
  static override readonly configSchema = ConfigSchema;
  static override readonly credentialsSchema = CredentialsSchema;

  override async input() {
    this.send({ token: this.credentials?.token });
  }
}

export default Secured;
