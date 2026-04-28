import { defineSchema, SchemaType } from "@bonsae/nrg/server";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "config-server" }),
    host: SchemaType.String({ default: "localhost" }),
    port: SchemaType.Number({ default: 1883 }),
  },
  { $id: "config-server:configs" },
);

export { ConfigsSchema };
