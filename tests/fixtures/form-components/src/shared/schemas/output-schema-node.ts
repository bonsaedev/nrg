import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

// Two output ports. Port 0 declares an output-schema default, so its Schema
// button is editable once Validate Data is on; port 1 has no default, so its
// button stays disabled (not overridable). Declaring `outputSchemas` opts the
// node into the Schema column.
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    inputSchema: SchemaType.InputSchema({
      default: '{ "type": "object" }',
    }),
    outputSchemas: SchemaType.OutputSchemas({
      default: { 0: '{ "type": "object" }' },
    }),
  },
  { $id: "output-schema-node:configs" },
);

export { ConfigsSchema };
