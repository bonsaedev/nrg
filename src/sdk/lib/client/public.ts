// The public type surface of `@bonsae/nrg/client`, kept in lockstep with the
// type re-exports of the runtime module (./index.ts). The published client.d.ts
// is generated from THIS curated module rather than the raw ./types, so the
// editor-runtime internals that describe the inliner's serialized output
// (NodeState, JsonSchemaObject, RuntimeNodeDefinition, NodeDefaults, …) stay
// out of the public surface. The hand-written defineNode/registerType/
// registerTypes declarations appended at build time reference NodeDefinition,
// NodeRedNode and Infer, so those must remain exported here. `useFormNode` is
// value-re-exported below instead of hand-appended: it depends only on
// already-public types (no editor-runtime internals), so dts-bundle-generator
// emits its real signature from source — no hand-maintained declaration to drift.
export type {
  NodeRedNode,
  NodeRedNodeButtonDefinition,
  NodeDefinition,
  NodeButtonDefinition,
  NodeFormDefinition,
  TypedInput,
  Infer,
} from "./types";

export { useFormNode } from "./form/composables/use-form-node";
