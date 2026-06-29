import type {
  Kind,
  TSchema,
  TObject,
  TProperties,
  Static,
  SchemaOptions,
} from "@sinclair/typebox";
import type { TYPED_INPUT_TYPES } from "../../../constants";
import type { JsonSchemaObjectExtensions } from "../../../schema-options";
import type {
  NodeSourceSchema,
  ErrorPortSchema,
  CompletePortSchema,
  StatusPortSchema,
} from "../base";

import type { NodeRefResolved, TypedInputResolved } from "../../../types";

/** Schema type representing a reference to a config node. Resolves to the node instance at runtime. */
interface TNodeRef<T = any> extends TSchema {
  [Kind]: "NodeRef";
  static: NodeRefResolved<T>;
  type: "string";
  format: "node-id";
  "x-nrg-node-type"?: string;
}

type TypedInputType = (typeof TYPED_INPUT_TYPES)[number];

/** Schema type representing a Node-RED TypedInput (value + type pair). */
interface TTypedInput<T = unknown> extends TSchema {
  [Kind]: "TypedInput";
  static: TypedInputResolved<T>;
  "x-nrg-typed-input": true;
}

interface NrgSchemaOptions extends SchemaOptions, JsonSchemaObjectExtensions {}

/** An NRG object schema created by {@link defineSchema}. */
type Schema<T extends TProperties = TProperties> = TObject<T>;

type NodeSource = Static<typeof NodeSourceSchema>;
type ErrorPortMessage = Static<typeof ErrorPortSchema>;
type CompletePortMessage = Static<typeof CompletePortSchema>;
type StatusPortMessage = Static<typeof StatusPortSchema>;

export type {
  TNodeRef,
  TTypedInput,
  TypedInputType,
  NrgSchemaOptions,
  Schema,
  NodeSource,
  ErrorPortMessage,
  CompletePortMessage,
  StatusPortMessage,
};
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
