import { defineSchema, SchemaType } from "@bonsae/nrg/server";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "custom-node" }),
    message: SchemaType.String({ default: "hello" }),
  },
  { $id: "custom-node:configs" },
);

const InputSchema = defineSchema(
  {
    payload: SchemaType.String(),
  },
  { $id: "custom-node:input" },
);

const OutputSchema = defineSchema(
  {
    result: SchemaType.String(),
    timestamp: SchemaType.Number(),
  },
  { $id: "custom-node:output" },
);

export { ConfigsSchema, InputSchema, OutputSchema };
