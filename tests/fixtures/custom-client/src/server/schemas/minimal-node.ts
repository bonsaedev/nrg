import { defineSchema, SchemaType } from "@bonsae/nrg/server";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
  },
  { $id: "minimal-node:configs" },
);

export { ConfigsSchema };
