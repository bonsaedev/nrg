type Channel = "sent" | "received";

interface Captured {
  port: number;
  msg: unknown;
}

interface Waiter {
  channel: Channel;
  id: string;
  port: number | undefined;
  index: number;
  settle: (msg: unknown) => void;
}

/**
 * Records every node's emitted (`sent`) and delivered (`received`) messages,
 * keyed by node id. `sent` is fed by wrapping each deployed node's `send` (so
 * emissions are captured regardless of wiring); `received` is fed by the
 * runtime's `onReceive` hook. This is the per-node "debugger" that backs
 * `node.sent()`, `node.received()` and `node.read()`.
 */
class Recorder {
  readonly #sent = new Map<string, Captured[]>();
  readonly #received = new Map<string, Captured[]>();
  #waiters: Waiter[] = [];

  recordSent(id: string, port: number, msg: unknown): void {
    this.#push("sent", id, { port, msg });
  }

  recordReceived(id: string | undefined, msg: unknown): void {
    if (!id) return;
    this.#push("received", id, { port: 0, msg });
  }

  /** Snapshot of all messages on a channel for a node (optionally one port). */
  snapshot(channel: Channel, id: string, port?: number): unknown[] {
    return this.#filter(channel, id, port).map((c) => c.msg);
  }

  /** Resolve the message at `index` on a channel, awaiting it if not yet seen. */
  next(
    channel: Channel,
    id: string,
    port: number | undefined,
    index: number,
    timeoutMs: number,
  ): Promise<unknown> {
    const existing = this.#filter(channel, id, port);
    if (existing.length > index) return Promise.resolve(existing[index].msg);

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        channel,
        id,
        port,
        index,
        settle: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      };
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w !== waiter);
        const where = port === undefined ? "" : ` on port ${port}`;
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for ${channel} message #${index} from node ${id}${where}`,
          ),
        );
      }, timeoutMs);
      this.#waiters.push(waiter);
    });
  }

  clear(): void {
    this.#sent.clear();
    this.#received.clear();
    this.#waiters = [];
  }

  #map(channel: Channel): Map<string, Captured[]> {
    return channel === "sent" ? this.#sent : this.#received;
  }

  #filter(channel: Channel, id: string, port: number | undefined): Captured[] {
    const list = this.#map(channel).get(id) ?? [];
    return port === undefined ? list : list.filter((c) => c.port === port);
  }

  #push(channel: Channel, id: string, captured: Captured): void {
    const map = this.#map(channel);
    const list = map.get(id) ?? [];
    list.push(captured);
    map.set(id, list);

    for (let i = this.#waiters.length - 1; i >= 0; i--) {
      const w = this.#waiters[i];
      if (w.channel !== channel || w.id !== id) continue;
      const filtered = this.#filter(channel, id, w.port);
      if (filtered.length > w.index) {
        this.#waiters.splice(i, 1);
        w.settle(filtered[w.index].msg);
      }
    }
  }
}

export { Recorder };
export type { Channel };
