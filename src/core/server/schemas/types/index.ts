import type {
  Kind,
  TSchema,
  TObject,
  TProperties,
  Static,
  SchemaOptions,
} from "@sinclair/typebox";
import type { TYPED_INPUT_TYPES } from "../../../constants";
import type TypedInput from "../../typed-input";
import type { NrgSchemaExtensions } from "../../schema-options";

interface TNodeRef<T = any> extends TSchema {
  [Kind]: "NodeRef";
  static: T;
  type: "string";
  format: "node-id";
  "x-nrg-node-type"?: string;
}

type ResolveNodeRefs<T> =
  T extends TypedInput<any>
    ? T
    : T extends (...args: any[]) => any
      ? T
      : T extends Array<infer Item>
        ? ResolveNodeRefs<Item>[]
        : T extends object
          ? { [K in keyof T]: ResolveNodeRefs<T[K]> }
          : T;

type Infer<T extends TSchema> = ResolveNodeRefs<Static<T>>;

type TypedInputType = (typeof TYPED_INPUT_TYPES)[number];

interface TTypedInput<T = unknown> extends TSchema {
  [Kind]: "TypedInput";
  static: TypedInput<T>;
}

interface NrgSchemaOptions extends SchemaOptions, NrgSchemaExtensions {}

type Schema<T extends TProperties = TProperties> = TObject<T>;

type InferOr<T, Fallback> = T extends TSchema ? Infer<T> : Fallback;

type InferOutputs<T> = T extends readonly TSchema[]
  ? { [K in keyof T]: T[K] extends TSchema ? Infer<T[K]> : never }
  : T extends TSchema
    ? Infer<T>
    : any;

export {
  Infer,
  InferOr,
  InferOutputs,
  ResolveNodeRefs,
  TNodeRef,
  TTypedInput,
  TypedInputType,
};
export type { NrgSchemaOptions };
export type { Schema };
export type {
  TSchema,
  TObject,
  TProperties,
  TString,
  TNumber,
  TBoolean,
  TArray,
  TUnion,
  TIntersect,
  TLiteral,
  TEnum,
  TRecord,
  TTuple,
  TOptional,
  TNull,
  TInteger,
  TRef,
  TConst,
  TFunction,
  SchemaOptions,
} from "@sinclair/typebox";
