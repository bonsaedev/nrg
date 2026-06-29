// The public type surface of `@bonsae/nrg/client`, kept in lockstep with the
// type re-exports of the runtime module (./index.ts). The published client.d.ts
// is generated from THIS curated module rather than the raw ./types, so the
// editor-runtime internals that describe the inliner's serialized output
// (NodeState, JsonSchemaObject, RuntimeNodeDefinition, NodeDefaults, …) stay
// out of the public surface. The hand-written defineNode/registerType/
// registerTypes/useFormNode declarations appended at build time reference
// NodeDefinition, NodeRedNode and Infer, so those must remain exported here.
export type {
  NodeRedNode,
  NodeDefinition,
  NodeButtonDefinition,
  NodeRedNodeButtonDefinition,
  NodeFormDefinition,
  NodeFeatures,
  TypedInputValue,
  Infer,
} from "./types";
