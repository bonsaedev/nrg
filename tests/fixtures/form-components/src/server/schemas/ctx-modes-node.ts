import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

// Three output ports for the docs context-modes screenshot: ports 0 & 1 get a
// context-mode default (so their Context Mode dropdowns are editable), port 2
// has none (locked to carry, disabled).
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "", minLength: 1 }),
    outputReturnProperties: SchemaType.OutputReturnProperties(),
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "trace", 1: "reset" },
    }),
  },
  { $id: "ctx-modes-node:configs" },
);

export { ConfigsSchema };
