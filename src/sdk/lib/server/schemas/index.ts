// Server-owned schemas and resolution types. The schema builders (`SchemaType`,
// `defineSchema`) and the plane-neutral schema types (`Schema`, `TNodeRef`,
// TypeBox aliases, …) come from `@bonsae/nrg/schema` (sdk/lib/shared/schemas) and
// are intentionally NOT re-exported here — keeping the schema/server boundary
// structural.
// Server-side schema-inference resolution types. (The built-in port message
// types + `Port` markers moved to nodes/types/ports — node vocabulary, not
// schema.)
export type { Infer, InferOr, InferOutputs, ResolvedStatic } from "./types";
