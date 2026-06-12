import type { TSchema, TProperties, ObjectOptions } from "@sinclair/typebox";
import type { Schema, NrgSchemaOptions } from "./types";
import { Type as BaseType, Kind } from "@sinclair/typebox";
import { TypedInputSchema } from "./base";
import type { TNodeRef, TTypedInput } from "./types";
import { isJSONType } from "ajv/dist/compile/rules";

/** Creates a schema for a reference to a config node by ID. */
function NodeRef<T extends new (...args: any[]) => any>(
  nodeClass: T,
  options?: NrgSchemaOptions,
): TNodeRef<InstanceType<T>> {
  return {
    ...BaseType.String({
      description:
        options?.description || `Reference to ${(nodeClass as any).type}`,
      format: "node-id",
    }),
    "x-nrg-node-type": (nodeClass as any).type,
    ...options,
    [Kind]: "NodeRef",
  } as unknown as TNodeRef<InstanceType<T>>;
}

/** Creates a schema for a Node-RED TypedInput (value + type pair). */
function TypedInput<T = unknown>(options?: NrgSchemaOptions): TTypedInput<T> {
  return {
    ...TypedInputSchema,
    "x-nrg-typed-input": true,
    ...options,
    [Kind]: "TypedInput",
  } as unknown as TTypedInput<T>;
}

/**
 * Declares the `outputReturnProperties` config map: the return property for
 * each output port, keyed by port index. A missing entry falls back to the
 * built-in `output` key. The node author supplies per-port defaults here;
 * declaring it also exposes an editable Return Property column per port in the
 * editor so flow authors can override them. Without it, every output uses
 * `output`.
 *
 * @example
 * ```ts
 * // port 0 defaults to `result`; every other port falls back to `output`
 * outputReturnProperties: SchemaType.OutputReturnProperties({
 *   default: { 0: "result" },
 * }),
 * ```
 */
function OutputReturnProperties(
  options?: NrgSchemaOptions & { default?: Record<number, string> },
) {
  return BaseType.Record(
    BaseType.Number(),
    BaseType.String({ pattern: "^[A-Za-z_$][A-Za-z0-9_$]*$" }),
    {
      description:
        "Per-port return property, keyed by output port index. A missing entry falls back to `output`.",
      default: {},
      ...options,
    },
  );
}

/**
 * Extended TypeBox type builder with NRG-specific schema types.
 * Includes all standard TypeBox types plus {@link NodeRef}, {@link TypedInput}
 * and {@link OutputReturnProperties}.
 */
const SchemaType = Object.assign({}, BaseType, {
  NodeRef,
  TypedInput,
  OutputReturnProperties,
});

function markNonValidatable<T extends TSchema>(schema: T): T {
  const type = (schema as any).type;

  const hasInvalidType =
    type !== undefined &&
    (Array.isArray(type) ? !type.every(isJSONType) : !isJSONType(type));

  // NOTE: if the type is non serializable, like Functions or Constructor, we must skip validation and avoid applying defaults
  if (hasInvalidType) {
    (schema as any)["x-nrg-skip-validation"] = true;

    if ((schema as any).default !== undefined) {
      (schema as any)._default = (schema as any).default;
      delete (schema as any).default;
    }

    // NOTE: delete type to avoid the following error during validation => Error registering node types: Error: type must be JSONType or JSONType[]: Function
    delete (schema as any).type;
  }

  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      markNonValidatable(prop as TSchema);
    }
  }

  if (schema.items) {
    markNonValidatable(schema.items as TSchema);
  }

  if (schema.anyOf) {
    schema.anyOf.forEach((s) => markNonValidatable(s as TSchema));
  }

  if (schema.allOf) {
    schema.allOf.forEach((s) => markNonValidatable(s as TSchema));
  }

  if (schema.oneOf) {
    schema.oneOf.forEach((s) => markNonValidatable(s as TSchema));
  }

  return schema;
}

/**
 * Creates a validated object schema from a set of properties. Automatically
 * marks non-JSON types (e.g., Function) as non-validatable.
 *
 * @example
 * ```ts
 * const ConfigsSchema = defineSchema({
 *   name: SchemaType.String({ default: "" }),
 *   timeout: SchemaType.Number({ default: 5000 }),
 * }, { $id: "my-node:configs" });
 * ```
 */
function defineSchema<T extends TProperties>(
  properties: T,
  options?: ObjectOptions & { $id?: string },
): Schema<T> {
  const schema = SchemaType.Object(properties, options);
  return markNonValidatable(schema) as Schema<T>;
}

export { SchemaType, defineSchema };
