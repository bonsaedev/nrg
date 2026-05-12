import { defineConfigNode } from "@bonsae/nrg/server";
import { ConfigsSchema, CredentialsSchema } from "../schemas/config-server";

export default defineConfigNode({
  type: "config-server",
  configSchema: ConfigsSchema,
  credentialsSchema: CredentialsSchema,
});
