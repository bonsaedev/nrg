import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "config-server" }),
    host: SchemaType.String({ default: "localhost" }),
    port: SchemaType.Number({ default: 1883 }),
  },
  { $id: "config-server:configs" },
);

export { ConfigsSchema };
