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
  schema?: any,
): ResolveNodeRefs<T> {
  const SKIP_PROPS = new Set(["id", "_id", "_users"]);

  // Build a set of property names that are node references based on the schema.
  // Only these properties will have their string values resolved via RED.nodes.getNode().
  const nodeRefProps = new Set<string>();
  if (schema?.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if ((propSchema as any)?.["x-nrg-node-type"]) {
        nodeRefProps.add(key);
      }
    }
  }

  // Per-node-instance cache: original object/array -> proxy or mapped array.
  // This preserves reference equality: config.server === config.server
  const cache = new WeakMap<object, any>();

  const createProxy = <O extends object>(obj: O): any => {
    const cached = cache.get(obj);
    if (cached) return cached;

    if (Array.isArray(obj)) {
      // Map once, cache the result array so identity is stable across reads
      const mapped = obj.map((item) => {
        if (item && typeof item === "object") {
          return createProxy(item);
        }
        return item;
      });
      cache.set(obj, mapped);
      return mapped;
    }

    const proxy = new Proxy(obj, {
      get(target: any, prop: string | symbol): any {
        if (typeof prop === "symbol") return target[prop];
        if (SKIP_PROPS.has(prop)) return target[prop];

        const value = target[prop];

        // Only resolve strings as node references if the schema marks the property
        if (
          typeof value === "string" &&
          value.length > 0 &&
          nodeRefProps.has(prop)
        ) {
          return RED.nodes.getNode(value)?._node ?? value;
        }

        if (value && typeof value === "object") {
          return createProxy(value); // hits the cache on repeat access
        }

        return value;
      },
    });

    cache.set(obj, proxy);
    return proxy;
  };

  return createProxy(config) as ResolveNodeRefs<T>;
}

export { setupConfigProxy, setupContext };
