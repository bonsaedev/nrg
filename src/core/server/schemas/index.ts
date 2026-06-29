// Schema authoring (SchemaType, defineSchema, and the base value schemas) is
// browser-safe and now lives in core/shared/schemas. It is re-exported here so
// the long-standing server-tree import path `server/schemas` stays stable.
export * from "../../shared/schemas";
// Framework-internal node config-shape schemas: not part of the public
// @bonsae/nrg/schema surface, but the node base classes resolve their config
// types (`Static<typeof …>`) from these, so the server tree re-exports them.
export {
  NodeConfigSchema,
  IONodeConfigSchema,
  ConfigNodeConfigSchema,
} from "../../shared/schemas/base";
// Server-side resolution types (Infer, ResolvedStatic, …) plus a re-export of
// the shared schema types.
export type * from "./types";
