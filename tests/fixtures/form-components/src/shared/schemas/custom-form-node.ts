import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // "sobject" is a custom editor-side TypedInput type, not one of the
    // built-in type constants — skip server-side validation for this prop.
    sobject: SchemaType.TypedInput({
      default: { value: "", type: "sobject" },
      "x-nrg-skip-validation": true,
    } as any),
  },
  { $id: "custom-form-node:configs" },
);

export { ConfigsSchema };
