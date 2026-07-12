import { NRG_MODULE_PRIVATE_CHANNEL, NRG_PRIVATE_CHANNEL } from "./symbols";

/**
 * The off-the-wire message channels: `protected` and `private`.
 *
 * Neither ever rides the wire message — both live here, in a per-runtime store
 * keyed by the message's `_msgid` (the id every clone of a message shares),
 * reachable only through the `msg.protected` / `msg.private` accessors nrg
 * installs on a node's incoming message. A flow author's function node gets the
 * bare wire message and can't reach either channel.
 *
 * Each message id holds one partition per partition-key symbol: a single shared
 * {@link NRG_PROTECTED_CHANNEL} partition (any node, any package) and one partition per
 * package (identified by {@link NRG_MODULE_PRIVATE_CHANNEL}) for `private` — so a package's
 * private data is invisible even to another package's nodes. The partition-key
 * symbols live in `./symbols` (their cross-bundle home).
 *
 * Entries are removed explicitly (`delete msg.private.x`, framework bookkeeping
 * only — the resource owns its own release) and swept on an idle TTL as a
 * backstop for messages that are dropped/abandoned before anyone deletes them.
 */

interface ChannelEntry {
  /** Last time this message's channels were written OR read — the idle TTL is
   * measured from here, so a long-lived-but-active message is never swept while
   * in use (only genuinely abandoned ones age out). */
  lastTouched: number;
  partitions: Map<symbol, Map<string, unknown>>;
}

class ChannelStore {
  readonly #byMsgid = new Map<string, ChannelEntry>();
  readonly #ttlMs: number;
  readonly #sweepMs: number;
  #sweeper?: NodeJS.Timeout;

  constructor(options: { ttlMs?: number; sweepMs?: number } = {}) {
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    this.#sweepMs = options.sweepMs ?? 60_000;
  }

  #channel(
    msgid: string,
    partition: symbol,
    create: boolean,
  ): Map<string, unknown> | undefined {
    let entry = this.#byMsgid.get(msgid);
    if (!entry) {
      if (!create) return undefined;
      entry = { lastTouched: Date.now(), partitions: new Map() };
      this.#byMsgid.set(msgid, entry);
      this.#ensureSweeper();
    } else {
      // Any access (read or write) keeps the message's channels alive — the idle
      // TTL sweeps only messages nobody has touched, never one mid-flight.
      entry.lastTouched = Date.now();
    }
    let channel = entry.partitions.get(partition);
    if (!channel && create) {
      channel = new Map();
      entry.partitions.set(partition, channel);
    }
    return channel;
  }

  /** Merge a producer's `{ … }` bag into a channel (send's protected/private args). */
  merge(msgid: string, partition: symbol, data: object): void {
    const channel = this.#channel(msgid, partition, true)!;
    for (const [key, value] of Object.entries(data)) channel.set(key, value);
  }

  get(msgid: string, partition: symbol, key: string): unknown {
    return this.#channel(msgid, partition, false)?.get(key);
  }

  set(msgid: string, partition: symbol, key: string, value: unknown): void {
    this.#channel(msgid, partition, true)!.set(key, value);
  }

  has(msgid: string, partition: symbol, key: string): boolean {
    return this.#channel(msgid, partition, false)?.has(key) ?? false;
  }

  /** Remove one entry — framework bookkeeping only; the resource owns release. */
  delete(msgid: string, partition: symbol, key: string): void {
    this.#channel(msgid, partition, false)?.delete(key);
  }

  keys(msgid: string, partition: symbol): string[] {
    return [...(this.#channel(msgid, partition, false)?.keys() ?? [])];
  }

  #ensureSweeper(): void {
    if (this.#sweeper) return;
    this.#sweeper = setInterval(() => this.#sweep(), this.#sweepMs);
    this.#sweeper.unref?.();
  }

  #sweep(): void {
    const now = Date.now();
    for (const [msgid, entry] of this.#byMsgid) {
      if (now - entry.lastTouched > this.#ttlMs) this.#byMsgid.delete(msgid);
    }
    if (this.#byMsgid.size === 0 && this.#sweeper) {
      clearInterval(this.#sweeper);
      this.#sweeper = undefined;
    }
  }
}

/** A live view over one (message, partition): reads/writes/deletes hit the store.
 * A message with no `_msgid` gets an INERT view (reads `undefined`, writes/deletes
 * no-op) rather than keying the store by `undefined` — which would let any two
 * id-less messages share one partition. Real Node-RED always delivers a `_msgid`,
 * so this only guards a malformed test message. */
function channelProxy(
  store: ChannelStore,
  msgid: string | undefined,
  partition: symbol,
): Record<string, unknown> {
  if (msgid == null) {
    return new Proxy(Object.create(null) as Record<string, unknown>, {
      get: () => undefined,
      set: () => true,
      deleteProperty: () => true,
      has: () => false,
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => undefined,
    });
  }
  return new Proxy(Object.create(null) as Record<string, unknown>, {
    get: (_t, key) =>
      typeof key === "string" ? store.get(msgid, partition, key) : undefined,
    set: (_t, key, value) => {
      if (typeof key === "string") store.set(msgid, partition, key, value);
      return true;
    },
    deleteProperty: (_t, key) => {
      if (typeof key === "string") store.delete(msgid, partition, key);
      return true;
    },
    has: (_t, key) =>
      typeof key === "string" ? store.has(msgid, partition, key) : false,
    ownKeys: () => store.keys(msgid, partition),
    getOwnPropertyDescriptor: (_t, key) =>
      typeof key === "string" && store.has(msgid, partition, key)
        ? {
            enumerable: true,
            configurable: true,
            writable: true,
            value: store.get(msgid, partition, key),
          }
        : undefined,
  });
}

/** The store partition for a node's `private` channel: the package partition
 * `defineModule` stamped under `NRG_MODULE_PRIVATE_CHANNEL`, or the default partition
 * for a node that was never moduled. */
function packageChannel(nodeClass: unknown): symbol {
  return (
    (nodeClass as Record<symbol, symbol | undefined>)[
      NRG_MODULE_PRIVATE_CHANNEL
    ] ?? NRG_PRIVATE_CHANNEL
  );
}

export { ChannelStore, channelProxy, packageChannel };
