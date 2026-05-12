import { defineSchema, SchemaType } from "@bonsae/nrg/server";

const SuccessSchema = defineSchema(
  {
    result: SchemaType.String(),
  },
  { $id: "multi-output-node:success" },
);

const ErrorSchema = defineSchema(
  {
    error: SchemaType.String(),
    code: SchemaType.Number(),
  },
  { $id: "multi-output-node:error" },
);

export { SuccessSchema, ErrorSchema };
