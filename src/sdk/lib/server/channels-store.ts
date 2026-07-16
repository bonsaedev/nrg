import { NRG_MODULE_PRIVATE_CHANNEL, NRG_PRIVATE_CHANNEL } from "./symbols";
import { NrgError } from "../shared/errors";

/** Thrown when an author ASSIGNS to a channel (`msg[Channels].private.x = …`).
 * Channel data is written on send — the incoming accessor is read + delete only. */
const ASSIGN_MESSAGE =
  "Cannot assign to a message channel. Channel data is written on send — " +
  "`send(port, value, { protected, private })`. The `msg[Channels]` accessor is " +
  "read + delete only (e.g. `delete msg[Channels].private.x`).";

/**
 * The off-the-wire message channels: `protected` and `private`.
 *
 * Neither ever rides the wire message — both live here, in a per-runtime store
 * keyed by the message's `_msgid` (the id every clone of a message shares),
 * reachable only through the `msg[Channels].protected` / `msg[Channels].private` accessors nrg
 * installs on a node's incoming message. A flow author's function node gets the
 * bare wire message and can't reach either channel.
 *
 * Each message id holds one partition per partition-key symbol: a single shared
 * {@link NRG_PROTECTED_CHANNEL} partition (any node, any package) and one partition per
 * package (identified by {@link NRG_MODULE_PRIVATE_CHANNEL}) for `private` — so a package's
 * private data is invisible even to another package's nodes. The partition-key
 * symbols live in `./symbols` (their cross-bundle home).
 *
 * Entries are removed explicitly (`delete msg[Channels].private.x`, framework bookkeeping
 * only — the resource owns its own release) and swept on an idle TTL as a
 * backstop for messages that are dropped/abandoned before anyone deletes them.
 */

/** Thrown when anything tries to overwrite or delete a FROZEN channel key — one
 * the framework owns and set once (e.g. a trigger node's `transactionId`). */
const FROZEN_MESSAGE = (key: string): string =>
  `Cannot modify the read-only channel key "${key}". It is set once by the ` +
  `framework on the originating trigger node and is immutable for the message's ` +
  `journey.`;

interface ChannelEntry {
  /** Last time this message's channels were written OR read — the idle TTL is
   * measured from here, so a long-lived-but-active message is never swept while
   * in use (only genuinely abandoned ones age out). */
  lastTouched: number;
  partitions: Map<symbol, Map<string, unknown>>;
  /** Per-partition set of FROZEN keys — written once via {@link ChannelStore.freeze}
   * (the framework's own path) and rejected by `merge`/`set`/`delete` thereafter,
   * so a node can never overwrite or remove them. */
  frozen: Map<symbol, Set<string>>;
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
      entry = {
        lastTouched: Date.now(),
        partitions: new Map(),
        frozen: new Map(),
      };
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

  /** Whether `key` is frozen in this (message, partition). */
  #isFrozen(msgid: string, partition: symbol, key: string): boolean {
    return this.#byMsgid.get(msgid)?.frozen.get(partition)?.has(key) ?? false;
  }

  /**
   * Write a value AND mark its key read-only (frozen): later `merge`/`set`/`delete`
   * on it throw. This is the framework's own path (e.g. a trigger node stamping its
   * `transactionId`); nodes never call it. Idempotent — re-freezing the same key
   * just refreshes the value.
   */
  freeze(msgid: string, partition: symbol, key: string, value: unknown): void {
    const channel = this.#channel(msgid, partition, true)!;
    channel.set(key, value);
    const entry = this.#byMsgid.get(msgid)!;
    let frozen = entry.frozen.get(partition);
    if (!frozen) {
      frozen = new Set();
      entry.frozen.set(partition, frozen);
    }
    frozen.add(key);
  }

  /** Merge a producer's `{ … }` bag into a channel (send's protected/private args). */
  merge(msgid: string, partition: symbol, data: object): void {
    // Reject the whole merge if it targets any frozen key — never a partial write.
    for (const key of Object.keys(data)) {
      if (this.#isFrozen(msgid, partition, key)) {
        throw new NrgError(FROZEN_MESSAGE(key));
      }
    }
    const channel = this.#channel(msgid, partition, true)!;
    for (const [key, value] of Object.entries(data)) channel.set(key, value);
  }

  get(msgid: string, partition: symbol, key: string): unknown {
    return this.#channel(msgid, partition, false)?.get(key);
  }

  set(msgid: string, partition: symbol, key: string, value: unknown): void {
    if (this.#isFrozen(msgid, partition, key)) {
      throw new NrgError(FROZEN_MESSAGE(key));
    }
    this.#channel(msgid, partition, true)!.set(key, value);
  }

  has(msgid: string, partition: symbol, key: string): boolean {
    return this.#channel(msgid, partition, false)?.has(key) ?? false;
  }

  /** Remove one entry — framework bookkeeping only; the resource owns release.
   * A frozen key can't be removed (throws), so the origin `transactionId` a
   * downstream node reads is never yanked out from under it. */
  delete(msgid: string, partition: symbol, key: string): void {
    if (this.#isFrozen(msgid, partition, key)) {
      throw new NrgError(FROZEN_MESSAGE(key));
    }
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

/** A live READ + DELETE view over one (message, partition): reads and deletes hit
 * the store; ASSIGNMENT throws (channels are written on send, never by mutating the
 * incoming message). A message with no `_msgid` gets an INERT view (reads `undefined`,
 * deletes no-op, assignment still throws) rather than keying the store by `undefined`
 * — which would let any two id-less messages share one partition. Real Node-RED always
 * delivers a `_msgid`, so this only guards a malformed test message. */
function channelProxy(
  store: ChannelStore,
  msgid: string | undefined,
  partition: symbol,
): Record<string, unknown> {
  if (msgid == null) {
    return new Proxy(Object.create(null) as Record<string, unknown>, {
      get: () => undefined,
      set: () => {
        throw new NrgError(ASSIGN_MESSAGE);
      },
      deleteProperty: () => true,
      has: () => false,
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => undefined,
    });
  }
  return new Proxy(Object.create(null) as Record<string, unknown>, {
    get: (_t, key) =>
      typeof key === "string" ? store.get(msgid, partition, key) : undefined,
    // Assignment is a misuse — channels are written on send, not by mutating the
    // incoming message. Throw loudly rather than silently writing a second path.
    set: () => {
      throw new NrgError(ASSIGN_MESSAGE);
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
            writable: false,
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
