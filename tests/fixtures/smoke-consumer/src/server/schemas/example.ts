import { defineSchema, SchemaType } from "@bonsae/nrg/server";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    message: SchemaType.String({ default: "hello" }),
  },
  { $id: "example-node:configs" },
);
