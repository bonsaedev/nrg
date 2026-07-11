import type { NodeConstructor } from "./nodes";
import { NRG_NODE, NRG_MODULE_PRIVATE_LANE } from "./symbols";
import { NrgError } from "../shared/errors";

/** Defines the set of nodes exported by a Node-RED package. */
interface ModuleDefinition {
  nodes: NodeConstructor[];
}

/**
 * Declares the nodes that make up a Node-RED module. The returned object is used
 * as the default export of `src/server/index.ts`. Only nrg node classes — those
 * extending {@link Node}/IONode/ConfigNode — are accepted, enforced by a runtime
 * guard that checks the private `NRG_NODE` symbol every nrg node class carries.
 *
 * @example
 * ```ts
 * export default defineModule({
 *   nodes: [MyNode, MyConfigNode],
 * });
 * ```
 */
function defineModule(definition: ModuleDefinition): ModuleDefinition {
  // One identity per module (= one npm package): the partition key for every
  // node's `private` lane, so a package's private data is invisible to nodes from
  // other packages. Stamped on each node class; instances read it via their
  // constructor. A fresh in-process symbol is enough — the lane store is
  // per-runtime and in-memory, so it need not survive restarts.
  const packagePrivateLane = Symbol("nrg.package.private");
  for (const NodeClass of definition.nodes) {
    if (!(NodeClass as unknown as Record<symbol, unknown>)[NRG_NODE]) {
      const name = (NodeClass as { name?: string })?.name || String(NodeClass);
      throw new NrgError(
        `defineModule: "${name}" is not an nrg node class — extend IONode/ConfigNode.`,
      );
    }
    (NodeClass as unknown as Record<symbol, unknown>)[NRG_MODULE_PRIVATE_LANE] =
      packagePrivateLane;
  }
  return definition;
}

export { defineModule };
export type { ModuleDefinition };
