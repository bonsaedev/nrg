// Server-owned schemas and resolution types. The schema builders (`SchemaType`,
// `defineSchema`) and the plane-neutral schema types (`Schema`, `TNodeRef`,
// TypeBox aliases, …) come from `@bonsae/nrg/schema` (core/shared/schemas) and
// are intentionally NOT re-exported here — keeping the schema/server boundary
// structural. These base schemas are authored with the shared builder but stay
// server-only: node authors never reference them directly.
export {
  NodeConfigSchema,
  IONodeConfigSchema,
  ConfigNodeConfigSchema,
  NodeSourceSchema,
  ErrorPortOutputSchema,
  CompletePortOutputSchema,
  StatusPortOutputSchema,
} from "./base";
// Server-side resolution types + built-in port message types.
export type {
  Infer,
  InferOr,
  InferOutputs,
  ResolvedStatic,
  NodeSource,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
} from "./types";
