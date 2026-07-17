import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

// Three output ports for the docs context-modes screenshot: ports 0 & 1 get a
// context-mode default that seeds their Context Mode dropdowns; port 2 has none
// and falls back to merge. Every dropdown is editable regardless.
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "", minLength: 1 }),
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "merge", 1: "reset" },
    }),
  },
  { $id: "ctx-modes-node:configs" },
);

export { ConfigsSchema };
