// Schema authoring (SchemaType, defineSchema, and the base value schemas) is
// browser-safe and now lives in core/shared/schemas. It is re-exported here so
// the long-standing server-tree import path `server/schemas` stays stable.
export * from "../../shared/schemas";
// Server-side resolution types (Infer, ResolvedStatic, …) plus a re-export of
// the shared schema types.
export type * from "./types";
