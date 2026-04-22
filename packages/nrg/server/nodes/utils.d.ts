import type { ResolveNodeRefs } from "../../schemas/types";
import type { RED, NodeRedContextStore } from "../types";
import type { NodeContextStore } from "./types";
declare function setupContext(context: NodeRedContextStore, store?: string): NodeContextStore;
declare function setupConfigProxy<T extends object>(RED: RED, config: T): ResolveNodeRefs<T>;
export { setupConfigProxy, setupContext };
