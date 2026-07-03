import type { ResolvedStatic } from "../schemas/types";
import type { Schema } from "../../shared/schemas";
import type { RED, NodeRedNode } from "../red";
import { NrgError } from "../../shared/errors";
import { NRG_NODE, NRG_CONFIG_NODE } from "./symbols";
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

  // Two dedicated caches: proxies keyed by the raw config object, TypedInput
  // wrappers keyed by the raw `{ type, value }` object. Distinct key spaces, so
  // keeping them separate is unambiguous.
  const proxyCache = new WeakMap<object, any>();
  const typedInputCache = new WeakMap<object, TypedInput>();

  // The schema describing `obj` is threaded through so marker resolution is
  // PATH-AWARE: a NodeRef/TypedInput is resolved only where the schema at that
  // exact depth declares it — a nested field that merely shares a name with a
  // top-level NodeRef is left alone (and, conversely, a genuinely nested NodeRef
  // is now resolved, matching what `ResolvedStatic` types).
  const createProxy = <O extends object>(obj: O, subSchema?: any): any => {
    const cached = proxyCache.get(obj);
    if (cached) return cached;

    // The schema for a given property: an array's elements share `items`; an
    // object's fields come from `properties[prop]`.
    const schemaForProp = (target: any, prop: string): any =>
      Array.isArray(target) ? subSchema?.items : subSchema?.properties?.[prop];

    const proxy = new Proxy(obj, {
      get(target: any, prop: string | symbol): any {
        if (typeof prop === "symbol") return target[prop];
        if (SKIP_PROPS.has(prop)) return target[prop];

        const value = target[prop];
        const fieldSchema = schemaForProp(target, prop);

        if (fieldSchema?.["x-nrg-node-type"]) {
          // An unset reference (empty/non-string id) resolves to `undefined`
          // rather than the raw `""` — `""` is typed as the node instance, so
          // `this.config.ref.method()` would throw the opaque
          // `"".method is not a function`. `undefined` makes falsy-guards and
          // optional chaining behave. A set-but-unresolved id falls back to the
          // raw id (the node may register later).
          if (typeof value !== "string" || value.length === 0) return undefined;
          const resolved = RED.nodes.getNode(value)?._node;
          // Runtime NodeRef guard — the only check a JS author gets (the
          // `ConfigNodeBrand` type is compile-time only): if the target is a
          // confirmed nrg node (its class carries NRG_NODE) but NOT a config node,
          // it's a misconfiguration. Non-nrg / unbranded targets (raw Node-RED
          // nodes, test mocks) fall through to the raw id, unchanged.
          const ctor = (
            resolved as { constructor?: Record<symbol, unknown> } | undefined
          )?.constructor;
          if (
            ctor?.[NRG_NODE] &&
            !(resolved as unknown as Record<symbol, unknown>)[NRG_CONFIG_NODE]
          ) {
            throw new NrgError(
              `Config field "${String(prop)}" references "${value}", which is not an nrg config node.`,
            );
          }
          return resolved ?? value;
        }

        if (
          fieldSchema?.["x-nrg-typed-input"] &&
          value &&
          typeof value === "object" &&
          "type" in value &&
          "value" in value
        ) {
          let ref = typedInputCache.get(value);
          if (!ref) {
            ref = new TypedInput(RED, node, value);
            typedInputCache.set(value, ref);
          }
          return ref;
        }

        if (value && typeof value === "object") {
          // Recurse with the child's schema so nested arrays/objects proxy
          // read-only too and their markers resolve at the right depth.
          return createProxy(value, fieldSchema);
        }

        return value;
      },
      set(_target: any, prop: string | symbol): boolean {
        throw new NrgError(
          `Cannot set property '${String(prop)}' on read-only node config`,
        );
      },
      deleteProperty(_target: any, prop: string | symbol): boolean {
        throw new NrgError(
          `Cannot delete property '${String(prop)}' on read-only node config`,
        );
      },
    });

    proxyCache.set(obj, proxy);
    return proxy;
  };

  return createProxy(config, schema) as ResolvedStatic<T>;
}

export { setupConfigProxy };
