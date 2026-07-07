import type { TObject } from "@sinclair/typebox";
import type { NrgSchemaOptions } from "./types";

/**
 * Derives a Node-RED node-definition `defaults` map from a config schema: one
 * entry per property, with `type` carrying the referenced config-node type for
 * NodeRef fields (`x-nrg-node-type`). Editor-managed keys (`x`/`y`/`z`/…) are
 * skipped. Browser-safe (pure schema → plain data), so both the server runtime
 * and the build inliner can share it.
 */
function getDefaultsFromSchema(
  schema: TObject | null | undefined,
):
  | Record<string, { type?: string; required: boolean; value: any }>
  | undefined {
  if (!schema?.properties) return undefined;

  const result: Record<
    string,
    { type?: string; required: boolean; value: any }
  > = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    // NOTE: these are excluded from defaults because they must be set by the editor
    if (["x", "y", "z", "g", "wires", "type", "id"].includes(key)) continue;

    const property = value as NrgSchemaOptions;

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

/**
 * Derives a Node-RED `credentials` map from a credentials schema: `password`
 * for fields with `format: "password"`, `text` otherwise (warning on the
 * latter, since a `text` credential is returned to the editor in cleartext).
 */
function getCredentialsFromSchema(
  schema: TObject | null | undefined,
): Record<string, { type: string; required: boolean; value: any }> | undefined {
  if (!schema?.properties) return undefined;

  const result: Record<
    string,
    { type: string; required: boolean; value: any }
  > = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    const property = value as NrgSchemaOptions;
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

function getSettingsFromSchema(
  schema: TObject | null | undefined,
  nodeType: string,
): Record<string, { value: unknown; exportable: boolean }> {
  const settings: Record<string, { value: unknown; exportable: boolean }> = {};
  if (!schema?.properties) return settings;
  const prefix = nodeType.replace(/-./g, (x) => x[1].toUpperCase());
  for (const [key, prop] of Object.entries(schema.properties)) {
    const settingKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
    settings[settingKey] = {
      value: prop.default,
      exportable: prop.exportable ?? false,
    };
  }
  return settings;
}

export {
  getDefaultsFromSchema,
  getCredentialsFromSchema,
  getSettingsFromSchema,
};
