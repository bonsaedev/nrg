import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "test-config" }),
    host: SchemaType.String({ default: "localhost" }),
    port: SchemaType.Number({ default: 8080 }),
  },
  { $id: "test-config:configs" },
);

export { ConfigsSchema };
