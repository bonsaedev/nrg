import type { TObject } from "@sinclair/typebox";
import type { NodeSchemaOptions } from "./types";

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
      type: property["node-type"],
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
    result[key] = {
      // NOTE: required is always false because it is controlled by the JSON Schema and AJV validation instead of using node-red client core
      required: false,
      type: property.format === "password" ? "password" : "text",
      value: property.default ?? undefined,
    };
  }

  return result;
}

export { getDefaultsFromSchema, getCredentialsFromSchema };
