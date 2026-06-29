import type { ResolvedStatic, Schema } from "../schemas/types";
import type { RED, NodeRedNode } from "../types";
import { NrgError } from "../../shared/errors";
import TypedInput from "../typed-input";

interface SetupConfigProxyOptions<T extends object> {
  RED: RED;
  node: NodeRedNode;
  config: T;
  schema?: Schema;
}

/**
 * Wrap a node's raw config in a read-only proxy that lazily resolves node
 * references (`x-nrg-node-type`) to their instances and TypedInput fields
 * (`x-nrg-typed-input`) to {@link TypedInput} wrappers.
 */
function setupConfigProxy<T extends object>(
  opts: SetupConfigProxyOptions<T>,
): ResolvedStatic<T> {
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

        if (nodeRefProps.has(prop)) {
          // An unset reference (empty/non-string id) resolves to `undefined`
          // rather than the raw `""` — `""` is typed as the node instance, so
          // `this.config.ref.method()` would throw the opaque
          // `"".method is not a function`. `undefined` makes falsy-guards and
          // optional chaining behave. A set-but-unresolved id falls back to the
          // raw id (the node may register later).
          if (typeof value !== "string" || value.length === 0) return undefined;
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

  return createProxy(config) as ResolvedStatic<T>;
}

export { setupConfigProxy };
