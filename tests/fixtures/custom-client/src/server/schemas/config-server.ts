import { defineSchema, SchemaType } from "@bonsae/nrg/server";

const ConfigsSchema = defineSchema(
  {
    host: SchemaType.String({ default: "localhost" }),
    port: SchemaType.Number({ default: 8080 }),
  },
  { $id: "config-server:configs" },
);

const CredentialsSchema = defineSchema(
  {
    apiKey: SchemaType.String(),
  },
  { $id: "config-server:credentials" },
);

export { ConfigsSchema, CredentialsSchema };
