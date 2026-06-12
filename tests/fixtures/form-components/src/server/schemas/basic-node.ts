import { defineSchema, SchemaType } from "@bonsae/nrg/server";

// A deliberately small node: just a name plus the framework-managed port
// settings, so the editor form shows the Name field and the Ports Settings /
// Lifecycle Ports sections without any other config fields in between.
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "", minLength: 1 }),
    outputReturnProperties: SchemaType.OutputReturnProperties(),
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "carry" },
    }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "basic-node:configs" },
);

export { ConfigsSchema };
