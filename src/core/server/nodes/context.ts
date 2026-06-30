import type { NodeRedContextStore } from "../red";
import type { NodeContextStore } from "./types";

/** Per-key promise chains for the in-process `update` fallback, keyed by the
 *  underlying store object so concurrent updates to one key serialize. */
const updateLocks = new WeakMap<
  NodeRedContextStore,
  Map<string, Promise<unknown>>
>();

/**
 * Wrap Node-RED's callback-style context store as the promise-based
 * {@link NodeContextStore} nrg nodes use (`this.context.node/flow/global`).
 *
 * `increment`/`update` are atomic: they delegate to the underlying store's
 * native op when it provides one (the only way to be atomic across instances —
 * e.g. a DynamoDB conditional write / Redis), and otherwise serialize per key
 * in-process (atomic within this instance, best-effort across HA replicas).
 */
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
      const next = await fn(await get<T>(key));
      await set(key, next);
      return next;
    };
    const previous = chains.get(lockKey) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    chains.set(lockKey, settled);
    // Prune the tail once this is the last queued op for the key, so the lock
    // map doesn't grow unbounded for high-cardinality keys. If a newer op has
    // queued behind it, the entry has been replaced and is left in place.
    void settled.then(() => {
      if (chains.get(lockKey) === settled) chains.delete(lockKey);
    });
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

export { setupContext };
