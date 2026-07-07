import { ConfigNode } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema, CredentialsSchema } from "@/schemas/config-server";

export default class ConfigServer extends ConfigNode {
  static override readonly type = "config-server";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly credentialsSchema: Schema = CredentialsSchema;
}
