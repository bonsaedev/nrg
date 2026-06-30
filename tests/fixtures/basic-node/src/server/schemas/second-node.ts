import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "second-node" }),
    rate: SchemaType.Number({ default: 100 }),
  },
  { $id: "second-node:configs" },
);

export { ConfigsSchema };
