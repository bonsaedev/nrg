// The public `@bonsae/nrg/schema` surface: the schema builders (`SchemaType`,
// `defineSchema`), the plane-neutral brand/factory types, and a curated slice of
// TypeBox's own type builders. The node config-shape and built-in port message
// TYPES (NodeConfig / IONodeConfig / ConfigNodeConfig, ErrorPortOutput / …) are
// server-only plain types — they live in sdk/lib/server/schemas/types and never
// reach this kit. `TypedInputSchema` stays framework-internal in ./base
// (consumed by the shared factory).
export { SchemaType, defineSchema } from "./factories";
// `Kind` is TypeBox's schema-brand symbol. Re-exported so the server tree can
// introspect schemas (single-schema detection in io-node) without importing
// @sinclair/typebox directly — all TypeBox access flows through this kit.
export { Kind } from "@sinclair/typebox";
export type {
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
  ConfigNodeBrand,
  TNodeRef,
  TTypedInput,
  NrgSchemaOptions,
  Schema,
  Static,
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
} from "./types";
