import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "custom-node" }),
    message: SchemaType.String({ default: "hello" }),
  },
  { $id: "custom-node:configs" },
);

export { ConfigsSchema };
