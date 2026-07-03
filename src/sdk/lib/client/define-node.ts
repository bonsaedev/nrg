import type { NodeDefinition } from "./types";

/**
 * Identity helper that types a node definition (`defineNode({ type, … })`).
 *
 * Deliberately isolated from `./registration` — which imports `.vue` components
 * and the whole editor runtime — so the test harnesses can re-export `defineNode`
 * into a Vue-free bundle. `registration.ts` re-exports it to keep the public
 * `@bonsae/nrg/client` surface unchanged.
 */
function defineNode<T extends NodeDefinition>(options: T): T {
  return options;
}

export { defineNode };
