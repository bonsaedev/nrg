import { Kind } from "@sinclair/typebox";
import type { ResolvedStatic, Schema } from "../schemas/types";
import type { RED, NodeRedNode, NodeRedContextStore } from "../types";
import type { NodeContextStore } from "./types";
import { NrgError } from "../../errors";
import TypedInput from "../typed-input";

/** Returns true if `obj` is a TypeBox schema (has the `Kind` symbol). */
function isSchemaLike(obj: unknown): boolean {
  return obj != null && typeof obj === "object" && Kind in obj;
}

/** Per-key promise chains for the in-process `update` fallback, keyed by the
 *  underlying store object so concurrent updates to one key serialize. */
const updateLocks = new WeakMap<
  NodeRedContextStore,
  Map<string, Promise<unknown>>
>();

function setupContext(
  context: NodeRedContextStore,
  store?: string,
): NodeContextStore {
  const get = <T = any>(key: string): Promise<T> =>
    new Promise((resolve, reject) =>
      context.get(key, store, (error, value) =>
        error ? reject(error) : resolve(value),
      ),
    );

  const set = <T = any>(key: string, value: T): Promise<void> =>
    new Promise((resolve, reject) =>
      context.set(key, value, store, (error) =>
        error ? reject(error) : resolve(),
      ),
    );

  const keys = (): Promise<string[]> =>
    new Promise((resolve, reject) =>
      context.keys(store, (error, k) => (error ? reject(error) : resolve(k))),
    );

  // Atomic read-modify-write. Delegate to the store's native op when present —
  // the only way to be atomic across instances (e.g. a DynamoDB conditional
  // write / Redis). Otherwise serialize per key in-process: atomic within this
  // Node-RED instance, best-effort across HA replicas.
  const nativeUpdate = context.update;
  const nativeIncrement = context.increment;

  const update = <T = any>(
    key: string,
    fn: (current: T) => T | Promise<T>,
  ): Promise<T> => {
    if (nativeUpdate) {
      return new Promise((resolve, reject) =>
        nativeUpdate(key, fn as (c: any) => any, store, (error, value) =>
          error ? reject(error) : resolve(value),
        ),
      );
    }
    let chains = updateLocks.get(context);
    if (!chains) updateLocks.set(context, (chains = new Map()));
    const lockKey = JSON.stringify([store ?? null, key]);
    const task = async (): Promise<T> => {
      const next = await fn((await get<T>(key)) as T);
      await set(key, next);
      return next;
    };
    const run = (chains.get(lockKey) ?? Promise.resolve()).then(task, task);
    chains.set(
      lockKey,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };

  const increment = (key: string, by = 1): Promise<number> => {
    if (nativeIncrement) {
      return new Promise((resolve, reject) =>
        nativeIncrement(key, by, store, (error, value) =>
          error ? reject(error) : resolve(value),
        ),
      );
    }
    return update<number>(key, (current) =>
      typeof current === "number" ? current + by : by,
    );
  };

  return { get, set, keys, update, increment };
}

interface SetupConfigProxyOptions<T extends object> {
  RED: RED;
  node: NodeRedNode;
  config: T;
  schema?: Schema;
}

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

  return createProxy(config) as ResolvedStatic<T>;
}

export { isSchemaLike, setupConfigProxy, setupContext };
