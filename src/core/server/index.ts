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
export type { RED, NodeRedRuntimeSettings } from "./types";
export {
  SchemaType,
  defineSchema,
  NodeSourceSchema,
  ErrorPortSchema,
  CompletePortSchema,
  StatusPortSchema,
} from "./schemas";
export type {
  Schema,
  Infer,
  TNodeRef,
  TTypedInput,
  NodeSource,
  ErrorPortMessage,
  CompletePortMessage,
  StatusPortMessage,
} from "./schemas/types";
