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
import type {
  NodeSourceSchema,
  ErrorPortSchema,
  CompletePortSchema,
  StatusPortSchema,
} from "../base";

interface NodeRefResolved<T = any> {
  readonly __nrg_node_ref: true;
  readonly __instance: T;
}

/** Schema type representing a reference to a config node. Resolves to the node instance at runtime. */
interface TNodeRef<T = any> extends TSchema {
  [Kind]: "NodeRef";
  static: NodeRefResolved<T>;
  type: "string";
  format: "node-id";
  "x-nrg-node-type"?: string;
}

type ResolveNodeRefs<T> =
  T extends NodeRefResolved<infer I>
    ? I
    : T extends TypedInput<any>
      ? T
      : T extends (...args: any[]) => any
        ? T
        : T extends Array<infer Item>
          ? ResolveNodeRefs<Item>[]
          : T extends object
            ? { [K in keyof T]: ResolveNodeRefs<T[K]> }
            : T;

/**
 * Infers the TypeScript type from a schema or a record of schemas.
 *
 * - Single schema: `Infer<typeof MySchema>` → the inferred message type
 * - Record of schemas: `Infer<typeof outputsSchema>` → `{ portName: InferredType }` port map
 *
 * The record form produces a simple mapped type that resolves eagerly,
 * giving `sendToPort()` proper autocomplete in class-based nodes.
 */
type Infer<T extends TSchema | Record<string, TSchema>> = T extends TSchema
  ? ResolveNodeRefs<Static<T>>
  : {
      [K in keyof T & string]: T[K] extends TSchema
        ? ResolveNodeRefs<Static<T[K]>>
        : never;
    };

type TypedInputType = (typeof TYPED_INPUT_TYPES)[number];

/** Schema type representing a Node-RED TypedInput (value + type pair). */
interface TTypedInput<T = unknown> extends TSchema {
  [Kind]: "TypedInput";
  static: TypedInput<T>;
  "x-nrg-typed-input": true;
}

interface NrgSchemaOptions extends SchemaOptions, NrgSchemaExtensions {}

/** An NRG object schema created by {@link defineSchema}. */
type Schema<T extends TProperties = TProperties> = TObject<T>;

type NodeSource = Static<typeof NodeSourceSchema>;
type ErrorPortMessage = Static<typeof ErrorPortSchema>;
type CompletePortMessage = Static<typeof CompletePortSchema>;
type StatusPortMessage = Static<typeof StatusPortSchema>;

type InferOr<T, Fallback> = T extends TSchema ? Infer<T> : Fallback;

type InferOutputs<T> = T extends readonly TSchema[]
  ? { [K in keyof T]: T[K] extends TSchema ? Infer<T[K]> : never }
  : T extends TSchema
    ? Infer<T>
    : T extends Record<string, TSchema>
      ? { [K in keyof T & string]: Infer<T[K]> }
      : any;

export {
  Infer,
  InferOr,
  InferOutputs,
  ResolveNodeRefs,
  NodeRefResolved,
  TNodeRef,
  TTypedInput,
  TypedInputType,
};
export type {
  NodeSource,
  ErrorPortMessage,
  CompletePortMessage,
  StatusPortMessage,
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
