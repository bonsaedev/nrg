import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
  },
  { $id: "minimal-node:configs" },
);

export { ConfigsSchema };
