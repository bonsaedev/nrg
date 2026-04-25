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

function extractIcon(options: Record<string, any> | undefined) {
  if (!options || !("icon" in options))
    return { rest: options ?? {}, xIcon: {} };
  const { icon, ...rest } = options;
  return { rest, xIcon: icon ? { "x-node-red-input-label-icon": icon } : {} };
}

function NodeRef<T extends new (...args: any[]) => any>(
  nodeClass: T,
  options?: SchemaOptions & { icon?: string },
): TNodeRef<InstanceType<T>> {
  const { rest, xIcon } = extractIcon(options);
  return {
    ...SchemaType.String({
      description:
        rest?.description || `Reference to ${(nodeClass as any).type}`,
      format: "node-id",
    }),
    "node-type": (nodeClass as any).type,
    ...rest,
    ...xIcon,
    [Kind]: "NodeRef",
  } as unknown as TNodeRef<InstanceType<T>>;
}

function TypedInput(
  options?: SchemaOptions & { types?: string[]; icon?: string },
): TTypedInput {
  const { rest, xIcon } = extractIcon(options);
  const { types, ...remaining } = rest as Record<string, any>;
  return {
    ...TypedInputSchema,
    ...remaining,
    ...(types ? { "x-typed-types": types } : {}),
    ...xIcon,
    [Kind]: "TypedInput",
  } as unknown as TTypedInput;
}

const _OriginalString = BaseType.String.bind(BaseType);
function StringWithLang(
  options?: SchemaOptions & { lang?: string; icon?: string },
) {
  const { rest, xIcon } = extractIcon(options);
  const { lang, ...remaining } = rest as Record<string, any>;
  return _OriginalString({
    ...remaining,
    ...(lang ? { "x-editor-language": lang } : {}),
    ...xIcon,
  });
}

const _OriginalNumber = BaseType.Number.bind(BaseType);
function NumberWithIcon(options?: SchemaOptions & { icon?: string }) {
  const { rest, xIcon } = extractIcon(options);
  return _OriginalNumber({ ...rest, ...xIcon });
}

const _OriginalInteger = BaseType.Integer.bind(BaseType);
function IntegerWithIcon(options?: SchemaOptions & { icon?: string }) {
  const { rest, xIcon } = extractIcon(options);
  return _OriginalInteger({ ...rest, ...xIcon });
}

const _OriginalBoolean = BaseType.Boolean.bind(BaseType);
function BooleanWithIcon(options?: SchemaOptions & { icon?: string }) {
  const { rest, xIcon } = extractIcon(options);
  return _OriginalBoolean({ ...rest, ...xIcon });
}

const SchemaType = Object.assign({}, BaseType, {
  String: StringWithLang,
  Number: NumberWithIcon,
  Integer: IntegerWithIcon,
  Boolean: BooleanWithIcon,
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
    (schema as any)["skip-validation"] = true;

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
