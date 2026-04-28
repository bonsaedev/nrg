import { defineSchema, SchemaType } from "@bonsae/nrg/server";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "custom-node" }),
    message: SchemaType.String({ default: "hello" }),
  },
  { $id: "custom-node:configs" },
);

export { ConfigsSchema };
