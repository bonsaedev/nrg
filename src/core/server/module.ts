import type { NodeConstructor } from "./nodes";
import { NRG_NODE } from "./nodes/symbols";
import { NrgError } from "../shared/errors";

/** Defines the set of nodes exported by a Node-RED package. */
interface ModuleDefinition {
  nodes: NodeConstructor[];
}

/**
 * Declares the nodes that make up a Node-RED module. The returned object is used
 * as the default export of `src/server/index.ts`. Only nrg node classes — those
 * extending {@link Node}/IONode/ConfigNode or built with defineIONode/
 * defineConfigNode — are accepted, enforced by a runtime guard that checks the
 * private `NRG_NODE` symbol every nrg node class carries.
 *
 * @example
 * ```ts
 * export default defineModule({
 *   nodes: [MyNode, MyConfigNode],
 * });
 * ```
 */
function defineModule(definition: ModuleDefinition): ModuleDefinition {
  for (const NodeClass of definition.nodes) {
    if (!(NodeClass as unknown as Record<symbol, unknown>)[NRG_NODE]) {
      const name = (NodeClass as { name?: string })?.name || String(NodeClass);
      throw new NrgError(
        `defineModule: "${name}" is not an nrg node class — extend IONode/ConfigNode or use defineIONode/defineConfigNode.`,
      );
    }
  }
  return definition;
}

export { defineModule };
export type { ModuleDefinition };
