// The plane-neutral schema-type surface: NRG's cross-plane brands, the
// schema-type interfaces the NRG builders produce (TNodeRef / TTypedInput), and
// a curated slice of TypeBox's own type builders re-exported for consumers of
// `@bonsae/nrg/schema`.
import type {
  Kind,
  TSchema,
  TObject,
  TProperties,
  SchemaOptions,
} from "@sinclair/typebox";
import type { JsonSchemaObjectExtensions } from "../schema-options";

// --- Cross-plane schema brands ---
//
// `Static<>` of NRG's special schemas (NodeRef, TypedInput, Unsafe) produces
// these nominal brand shapes. Each plane maps them differently:
// - server `ResolvedStatic` (server/schemas/types): brand → runtime value
//   (NodeRef → the node instance, TypedInput → the resolving wrapper)
// - client `EditorStatic` (client/types): brand → editor form value
//   (NodeRef → the referenced node id string, TypedInput → { value, type })
//
// Both planes import them type-only from here, so renaming or reshaping a brand
// is a compile error on both sides instead of silent type drift. `ConfigNodeBrand`
// is the marker a config node carries so the browser-safe `NodeRef<T>` builder can
// constrain `T` to a config node without the shared layer importing the server class.
//
// The brand keys are plain strings (NOT `unique symbol`s): a symbol's identity is
// per-declaration, so when nrg ships as separate bundled .d.ts files (schema /
// server / client) each re-declares its own symbol and the brands stop matching
// across bundles — the resolvers silently fall through. String keys are structural
// (identical in every bundle), so cross-plane resolution survives distribution.

/** Brand produced by `Static` of a NodeRef schema. */
interface NodeRefBrand<T = any> {
  readonly __nrg_node_ref: true;
  readonly __payload: T;
}

/**
 * Brand produced by `Static` of a TypedInput schema. Carries the resolved value
 * type `T` so each plane maps it: the server `ResolvedStatic` → the `TypedInput<T>`
 * class instance (with `.resolve()`); the client `EditorStatic` → the raw
 * `{ value, type }` editor pair. Nominal so the shared schema type never needs to
 * reference the server `TypedInput` class.
 */
interface TypedInputBrand<T = unknown> {
  readonly __nrg_typed_input: true;
  readonly __payload: T;
}

/**
 * Brand produced by `Static` of an `Unsafe<T>` schema. Carries `T` so both planes
 * resolve it straight back to `T` unchanged. Without the brand, a class instance
 * passed via `Unsafe<Conn>` would be deep-mapped by `ResolvedStatic`/`EditorStatic`
 * into a structural object, silently dropping private/protected/`#` members so the
 * result is no longer assignable to `Conn` (TS2741) — the documented non-data-value
 * use case (connections, streams, Buffers).
 */
interface UnsafeBrand<T = unknown> {
  readonly __nrg_unsafe: true;
  readonly __payload: T;
}

/**
 * Type-only marker carried by every nrg config node — the server `ConfigNode`
 * class and the `IConfigNode` interface both declare it. It lets the browser-safe
 * `NodeRef<T>` builder constrain `T` to a config node WITHOUT the shared layer
 * importing the server `ConfigNode` type. Phantom — declared type-only, never a
 * real runtime field.
 */
interface ConfigNodeBrand {
  readonly __nrg_config_node: true;
}

// --- Schema-type interfaces produced by the NRG builders ---

/** Schema type representing a reference to a config node. Resolves to the node instance at runtime. */
interface TNodeRef<T = any> extends TSchema {
  [Kind]: "NodeRef";
  static: NodeRefBrand<T>;
  type: "string";
  format: "node-id";
  "x-nrg-node-type"?: string;
}

/** Schema type representing a Node-RED TypedInput (value + type pair). */
interface TTypedInput<T = unknown> extends TSchema {
  [Kind]: "TypedInput";
  static: TypedInputBrand<T>;
  "x-nrg-typed-input": true;
}

/** Schema options accepted by NRG builders — TypeBox's plus NRG's custom keywords. */
interface NrgSchemaOptions extends SchemaOptions, JsonSchemaObjectExtensions {}

/** An NRG object schema created by {@link defineSchema}. */
type Schema<T extends TProperties = TProperties> = TObject<T>;

export type {
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
  ConfigNodeBrand,
  TNodeRef,
  TTypedInput,
  NrgSchemaOptions,
  Schema,
};

// --- Curated TypeBox type builders (public @bonsae/nrg/schema surface) ---
/**
 * Raw TypeBox static type. For a schema containing `NodeRef` / `TypedInput` /
 * `Unsafe` fields, `Static<>` resolves those fields to their raw brand shapes
 * (e.g. `{ __nrg_node_ref: true; … }`), NOT the usable per-plane value. Use
 * `Infer` from `@bonsae/nrg/server` (node instances / `TypedInput` wrappers) or
 * `@bonsae/nrg/client` (editor `string` / `{ value, type }`) for branded schemas.
 * @see Infer
 */
export type { Static } from "@sinclair/typebox";
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
