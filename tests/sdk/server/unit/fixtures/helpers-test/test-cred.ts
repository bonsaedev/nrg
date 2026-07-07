import { IONode, type Infer } from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";

// A types-first node with credentials + a TypedInput config field. One input port
// and one output port come from the generics; the config/credentials schemas
// drive validation and the editor form.
const CredentialNodeSchema = defineSchema(
  {
    name: SchemaType.String({ default: "cred-node" }),
    endpoint: SchemaType.TypedInput<string>(),
  },
  { $id: "test-helpers:cred-config" },
);

const CredentialSchema = defineSchema(
  {
    apiKey: SchemaType.Optional(SchemaType.String({ default: "" })),
  },
  { $id: "test-helpers:cred-creds" },
);

type CredConfig = Infer<typeof CredentialNodeSchema>;
type CredCreds = Infer<typeof CredentialSchema>;
type Input = { payload?: unknown };
type Output = { payload: string; auth: string };

class TestCredNode extends IONode<CredConfig, CredCreds, Input, Output> {
  static override readonly type = "test-cred";
  static override readonly category = "function";
  static override readonly configSchema: Schema = CredentialNodeSchema;
  static override readonly credentialsSchema: Schema = CredentialSchema;

  override async input(msg: Input) {
    const key = this.credentials?.apiKey;
    if (!key) {
      this.warn("no api key");
      return;
    }
    const resolved = await this.config.endpoint.resolve(msg);
    this.send({ payload: resolved, auth: key });
  }
}

export default TestCredNode;
