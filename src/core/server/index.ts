import type { NodeConstructor } from "./nodes/types";

/** Defines the set of nodes exported by a Node-RED package. */
interface ModuleDefinition {
  nodes: NodeConstructor[];
}

/**
 * Declares the nodes that make up a Node-RED module. The returned object
 * is used as the default export of `src/server/index.ts`.
 *
 * @example
 * ```ts
 * export default defineModule({
 *   nodes: [MyNode, MyConfigNode],
 * });
 * ```
 */
function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export { registerType, registerTypes } from "./registration";
export { defineModule };
export type { ModuleDefinition };
export {
  Node,
  IONode,
  ConfigNode,
  defineIONode,
  defineConfigNode,
} from "./nodes";
export type { ContextMode } from "./nodes";
export type {
  NodeConstructor,
  INode,
  IIONode,
  IConfigNode,
} from "./nodes/types";
export { NrgError } from "../shared/errors";
export type { RED, NodeRedRuntimeSettings } from "./red";
// Schema builders (`SchemaType`, `defineSchema`, the `*PortSchema` values) and
// the plane-neutral schema types (`Schema`, `TNodeRef`, `TTypedInput`,
// `NodeSource`, `*PortMessage`) are NOT re-exported here — import them from
// `@bonsae/nrg/schema`. Keeping them off `/server` makes the schema/server
// boundary structural: you can't accidentally pull a builder through the node
// runtime entry. Only `Infer` stays — it is the server-plane resolution type
// (NodeRef → node instance, TypedInput → `TypedInput<T>` wrapper).
export type { Infer } from "./schemas/types";
