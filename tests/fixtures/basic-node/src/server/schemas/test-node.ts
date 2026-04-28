import { defineSchema, SchemaType } from "@bonsae/nrg/server";
import ConfigServer from "../nodes/config-server";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "test-node" }),
    timeout: SchemaType.Number({ default: 5000 }),
    enabled: SchemaType.Boolean({ default: true }),
    server: SchemaType.NodeRef(ConfigServer),
  },
  { $id: "test-node:configs" },
);

const CredentialsSchema = defineSchema(
  {
    apiKey: SchemaType.String({ default: "", format: "password" }),
  },
  { $id: "test-node:credentials" },
);

export { ConfigsSchema, CredentialsSchema };
