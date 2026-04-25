import type {
  TSchema,
  TProperties,
  SchemaOptions,
  ObjectOptions,
} from "@sinclair/typebox";
import type { Schema } from "./types";
import { Type as BaseType, Kind } from "@sinclair/typebox";
import { TypedInputSchema } from "./base";
import type { TNodeRef, TTypedInput } from "./types";
import { isJSONType } from "ajv/dist/compile/rules";

function NodeRef<T extends new (...args: any[]) => any>(
  nodeClass: T,
  options?: SchemaOptions,
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

function TypedInput(options?: SchemaOptions): TTypedInput {
  return {
    ...TypedInputSchema,
    ...options,
    [Kind]: "TypedInput",
  } as unknown as TTypedInput;
}

const SchemaType = Object.assign({}, BaseType, {
  NodeRef,
  TypedInput,
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

function defineSchema<T extends TProperties>(
  properties: T,
  options: ObjectOptions & { $id: string },
): Schema<T> {
  const schema = SchemaType.Object(properties, options);
  return markNonValidatable(schema) as Schema<T>;
}

export { SchemaType, defineSchema };
