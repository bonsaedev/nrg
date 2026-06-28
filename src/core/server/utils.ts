import type { TObject, SchemaOptions } from "@sinclair/typebox";

interface NodeSchemaOptions extends SchemaOptions {
  "x-nrg-node-type"?: string;
  default?: any;
  format?: string;
}

function getDefaultsFromSchema(
  schema: TObject,
): Record<string, { type?: string; required: boolean; value: any }> {
  const result: Record<
    string,
    { type?: string; required: boolean; value: any }
  > = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    // NOTE: these are excluded from defaults because they must be set by the editor
    if (["x", "y", "z", "g", "wires", "type", "id"].includes(key)) continue;

    const property = value as NodeSchemaOptions;

    result[key] = {
      // NOTE: required is always false because it is controlled by the JSON Schema and AJV validation instead of using node-red client core
      required: false,
      value: property.default ?? undefined,
      // NOTE: I'm using a custom json schema keyword to determine the node type
      type: property["x-nrg-node-type"],
    };
  }

  return result;
}

function getCredentialsFromSchema(
  schema: TObject,
): Record<string, { type: string; required: boolean; value: any }> {
  const result: Record<
    string,
    { type: string; required: boolean; value: any }
  > = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    const property = value as NodeSchemaOptions;
    const isPassword = property.format === "password";
    if (!isPassword) {
      // A credential without format:"password" is registered as a `text`
      // credential, which Node-RED returns to the editor in cleartext. Warn so
      // an author who meant it to be secret adds the password format (rather
      // than silently defaulting to password, which would break legitimately
      // visible credential fields like a public client id).
      console.warn(
        `[nrg] credential "${key}" has no format:"password" — it is stored as a visible (cleartext-in-editor) credential. Add { format: "password" } to mask it.`,
      );
    }
    result[key] = {
      // NOTE: required is always false because it is controlled by the JSON Schema and AJV validation instead of using node-red client core
      required: false,
      type: isPassword ? "password" : "text",
      value: property.default ?? undefined,
    };
  }

  return result;
}

export { getDefaultsFromSchema, getCredentialsFromSchema };
