import type { ResolveNodeRefs } from "../schemas/types";
import type { RED, NodeRedNode, NodeRedContextStore } from "../types";
import type { NodeContextStore } from "./types";
import { NrgError } from "../../errors";
import TypedInput from "../typed-input";

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

interface SetupConfigProxyOptions<T extends object> {
  RED: RED;
  node: NodeRedNode;
  config: T;
  schema?: any;
}

function setupConfigProxy<T extends object>(
  opts: SetupConfigProxyOptions<T>,
): ResolveNodeRefs<T> {
  const { RED, node, config, schema } = opts;
  const SKIP_PROPS = new Set(["id", "_id", "_users"]);

  const nodeRefProps = new Set<string>();
  const typedInputProps = new Set<string>();
  if (schema?.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const s = propSchema as any;
      if (s?.["x-nrg-node-type"]) nodeRefProps.add(key);
      if (s?.["x-nrg-typed-input"]) typedInputProps.add(key);
    }
  }

  const cache = new WeakMap<object, any>();

  const createProxy = <O extends object>(obj: O): any => {
    const cached = cache.get(obj);
    if (cached) return cached;

    if (Array.isArray(obj)) {
      const mapped = obj.map((item) =>
        item && typeof item === "object" ? createProxy(item) : item,
      );
      cache.set(obj, mapped);
      return mapped;
    }

    const proxy = new Proxy(obj, {
      get(target: any, prop: string | symbol): any {
        if (typeof prop === "symbol") return target[prop];
        if (SKIP_PROPS.has(prop)) return target[prop];

        const value = target[prop];

        if (
          typeof value === "string" &&
          value.length > 0 &&
          nodeRefProps.has(prop)
        ) {
          return RED.nodes.getNode(value)?._node ?? value;
        }

        if (
          typedInputProps.has(prop) &&
          value &&
          typeof value === "object" &&
          "type" in value &&
          "value" in value
        ) {
          let ref = cache.get(value);
          if (!ref) {
            ref = new TypedInput(RED, node, value);
            cache.set(value, ref);
          }
          return ref;
        }

        if (value && typeof value === "object") {
          return createProxy(value);
        }

        return value;
      },
      set(_target: any, prop: string | symbol): boolean {
        throw new NrgError(
          `Cannot set property '${String(prop)}' on read-only node config`,
        );
      },
    });

    cache.set(obj, proxy);
    return proxy;
  };

  return createProxy(config) as ResolveNodeRefs<T>;
}

export { setupConfigProxy, setupContext };
