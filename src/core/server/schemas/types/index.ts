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

interface TNodeRef<T = any> extends TSchema {
  [Kind]: "NodeRef";
  static: T;
  type: "string";
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

interface NrgFormOptions {
  icon?: string;
  typedInputTypes?: string[];
  editorLanguage?: string;
  toggle?: boolean;
}

interface NrgSchemaOptions extends SchemaOptions {
  exportable?: boolean;
  "x-nrg-node-type"?: string;
  "x-nrg-form"?: NrgFormOptions;
}

interface Schema<T extends TProperties = TProperties> extends TObject<T> {
  $id: string;
}

export { Infer, ResolveNodeRefs, TNodeRef, TTypedInput, TypedInputType };
export type { NrgFormOptions, NrgSchemaOptions };
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
