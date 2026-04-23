import type { ResolveNodeRefs } from "../schemas/types";
import type { RED, NodeRedContextStore } from "../types";
import type { NodeContextStore } from "./types";

function setupContext(
  context: NodeRedContextStore,
  store?: string,
): NodeContextStore {
  return {
    get: (key) =>
      new Promise((resolve, reject) =>
        context.get(key, store, (error, value) =>
          error ? reject(error) : resolve(value),
        ),
      ),

    set: (key, value) =>
      new Promise((resolve, reject) =>
        context.set(key, value, store, (error) =>
          error ? reject(error) : resolve(),
        ),
      ),

    keys: () =>
      new Promise((resolve, reject) =>
        context.keys(store, (error, k) => (error ? reject(error) : resolve(k))),
      ),
  };
}

function setupConfigProxy<T extends object>(
  RED: RED,
  config: T,
): ResolveNodeRefs<T> {
  // NOTE: must not proxy its own id or parents ids
  const SKIP_PROPS = new Set(["id", "_id", "_users"]);

  const createProxy = <O extends object>(obj: O): any => {
    return new Proxy(obj, {
      get(target: any, prop: string | symbol): any {
        if (typeof prop === "symbol") {
          return target[prop];
        }

        if (SKIP_PROPS.has(prop)) {
          return target[prop];
        }

        const value = target[prop];

        if (typeof value === "string" && value.length > 0) {
          // NOTE: using the instance provided by the user instead of node-red's internal one
          const node = RED.nodes.getNode(value)?._node;
          return node || value;
        }

        if (Array.isArray(value)) {
          return value.map((item) => {
            if (typeof item === "string") {
              // NOTE: using the instance provided by the user instead of node-red's internal one
              const node = RED.nodes.getNode(item)?._node;
              return node || item;
            }
            if (item && typeof item === "object") {
              return createProxy(item);
            }
            return item;
          });
        }

        if (value && typeof value === "object") {
          return createProxy(value);
        }

        return value;
      },
    });
  };

  return createProxy(config) as ResolveNodeRefs<T>;
}

export { setupConfigProxy, setupContext };
