// Server-owned schemas and resolution types. The schema builders (`SchemaType`,
// `defineSchema`) and the plane-neutral schema types (`Schema`, `TNodeRef`,
// TypeBox aliases, …) come from `@bonsae/nrg/schema` (sdk/lib/shared/schemas) and
// are intentionally NOT re-exported here — keeping the schema/server boundary
// structural.
// Server-side resolution types + built-in port message types (plain types —
// nothing validates against them at runtime, so no schema objects remain).
export type {
  Infer,
  InferOr,
  InferOutputs,
  ResolvedStatic,
  NodeSource,
  ErrorInfo,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
} from "./types";
