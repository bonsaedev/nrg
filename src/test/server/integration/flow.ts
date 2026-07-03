import { setupContext } from "@/core/server/nodes/context";
import type {
  NodeConstructor,
  NodeContextStore,
} from "@/core/server/nodes/types/node";
import type { Recorder } from "./recorder";
import type { NodeRedApi, RuntimeNode } from "./runtime";

interface NodeContext {
  node: NodeContextStore;
  flow: NodeContextStore;
  global: NodeContextStore;
}

let seq = 0;
function genId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq.toString(36)}`;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface AddNodeOptions {
  /** Override the generated node id. */
  id?: string;
  /** Node name (the `name` field). */
  name?: string;
  /** Credentials for the node (stored by the runtime, exposed as `this.credentials`). */
  credentials?: Record<string, unknown>;
}

interface ReadOptions {
  /** Reject if no message arrives within this many ms. @default 5000 */
  timeout?: number;
}

/**
 * A handle to one node in a deployed flow. Wraps a generated id; the live
 * instance lives inside the runtime, so harness methods (`receive`/`read`/…)
 * never collide with the node's own methods.
 */
class NodeRef {
  readonly id: string;
  readonly type: string;
  readonly isConfig: boolean;
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly credentials?: Record<string, unknown>;
  readonly wires: string[][] = [];

  readonly #flow: Flow;
  readonly #readCursor = new Map<number | undefined, number>();

  constructor(
    flow: Flow,
    type: string,
    isConfig: boolean,
    config: Record<string, unknown>,
    opts: AddNodeOptions,
  ) {
    this.#flow = flow;
    this.type = type;
    this.isConfig = isConfig;
    this.config = config;
    this.credentials = opts.credentials;
    this.id = opts.id ?? genId("n");
    this.name = opts.name ?? "";
  }

  /** Wire this node's output `port` to `target`'s input. */
  wire(target: NodeRef, port = 0): this {
    while (this.wires.length <= port) this.wires.push([]);
    this.wires[port].push(target.id);
    return this;
  }

  /**
   * Deliver a message to this node's input (Node-RED's upstream path) and settle
   * once the node has FINISHED processing it — i.e. called `done()` — so that
   * `await ref.receive(m); expect(ref.sent())…` is reliable even when `input()`
   * awaits async work. (The prior single-tick settle raced such handlers.)
   *
   * NOTE: this waits for *this node's* completion. Emissions a node makes AFTER
   * `done()` (e.g. a later timer/stream tick) still need `read()`.
   */
  async receive(msg: unknown): Promise<void> {
    const node = this.#flow.runtimeNode(this.id);
    if (!node) {
      throw new Error(
        `Node "${this.id}" (${this.type}) is not deployed — call flow.deploy() first`,
      );
    }
    // Tag the message so onComplete can be correlated back to this delivery.
    let msgid: string | undefined;
    if (msg && typeof msg === "object") {
      const m = msg as Record<string, unknown>;
      if (typeof m._msgid !== "string") m._msgid = genId("msg");
      msgid = m._msgid as string;
    }
    node.receive(msg);
    if (msgid) {
      await this.#flow.recorder.waitForComplete(this.id, msgid, 5000);
    }
    // A final microtask drain so any synchronous post-done() emissions land.
    await tick();
  }

  /** Snapshot of everything this node has emitted (optionally one port). */
  sent(port?: number): unknown[] {
    return this.#flow.recorder.snapshot("sent", this.id, port);
  }

  /** Snapshot of everything delivered to this node's input. */
  received(port?: number): unknown[] {
    return this.#flow.recorder.snapshot("received", this.id, port);
  }

  /**
   * Promise-based access to this node's context stores (`node` / `flow` /
   * `global`) — preset values before `receive`, and assert them afterward.
   */
  get context(): NodeContext {
    const rn = this.#flow.runtimeNode(this.id);
    if (!rn) {
      throw new Error(
        `Node "${this.id}" (${this.type}) is not deployed — call flow.deploy() first`,
      );
    }
    const ctx = rn.context();
    return {
      node: setupContext(ctx),
      flow: setupContext(ctx.flow),
      global: setupContext(ctx.global),
    };
  }

  /**
   * Consume the next un-read message this node emitted (FIFO cursor), awaiting
   * it if not yet sent. Call repeatedly to walk multiple emissions.
   */
  async read(port?: number, opts: ReadOptions = {}): Promise<unknown> {
    const cursor = this.#readCursor.get(port) ?? 0;
    const msg = await this.#flow.recorder.next(
      "sent",
      this.id,
      port,
      cursor,
      opts.timeout ?? 5000,
    );
    this.#readCursor.set(port, cursor + 1);
    return msg;
  }
}

/**
 * Builds a flow from nrg node classes and deploys it into a running runtime.
 * Use `addNode` for every node — config nodes included.
 */
class Flow {
  readonly recorder: Recorder;

  readonly #RED: NodeRedApi;
  readonly #flowId = genId("flow");
  #nodes: NodeRef[] = [];

  constructor(RED: NodeRedApi, recorder: Recorder) {
    this.#RED = RED;
    this.recorder = recorder;
  }

  /** Add any node — regular or config (detected via `category === "config"`). */
  addNode(
    Cls: NodeConstructor,
    config: Record<string, unknown> = {},
    opts: AddNodeOptions = {},
  ): NodeRef {
    const isConfig =
      (Cls as unknown as { category?: string }).category === "config";
    const ref = new NodeRef(this, Cls.type, isConfig, config, opts);
    this.#nodes.push(ref);
    return ref;
  }

  /** Build the flow JSON and deploy it; resolves once the flow has started. */
  async deploy(): Promise<void> {
    this.recorder.clear();
    const flows = this.#buildFlows();
    await this.#RED.runtime.flows.setFlows({
      flows: { flows },
      deploymentType: "full",
    });
    await this.#waitForDeploy();
  }

  /** Drop the built nodes and clear captured messages (reset between tests). */
  async clear(): Promise<void> {
    this.#nodes = [];
    this.recorder.clear();
    await this.#RED.runtime.flows.setFlows({
      flows: { flows: [] },
      deploymentType: "full",
    });
  }

  runtimeNode(id: string) {
    return this.#RED.nodes.getNode(id);
  }

  #buildFlows(): unknown[] {
    const flows: unknown[] = [
      { id: this.#flowId, type: "tab", label: "nrg-integration" },
    ];
    for (const ref of this.#nodes) {
      const base = {
        id: ref.id,
        type: ref.type,
        name: ref.name,
        ...this.#serializeConfig(ref.config),
        ...(ref.credentials ? { credentials: ref.credentials } : {}),
      };
      flows.push(
        ref.isConfig
          ? base
          : {
              ...base,
              z: this.#flowId,
              wires: ref.wires.length ? ref.wires : [[]],
            },
      );
    }
    return flows;
  }

  /** NodeRef config values serialize to the referenced node's id (a real NodeRef). */
  #serializeConfig(config: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      out[key] = value instanceof NodeRef ? value.id : value;
    }
    return out;
  }

  async #waitForDeploy(): Promise<void> {
    const target = this.#nodes.find((n) => !n.isConfig);
    if (!target) return;

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !this.#RED.nodes.getNode(target.id)) {
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    if (!this.#RED.nodes.getNode(target.id)) {
      throw new Error("Flow deploy did not complete within 5s");
    }

    // wrap each node's send so emissions are recorded regardless of wiring
    for (const ref of this.#nodes) {
      if (ref.isConfig) continue;
      const rn = this.#RED.nodes.getNode(ref.id);
      if (rn) this.#wrapSend(rn, ref.id);
    }
    await tick();
  }

  #wrapSend(rn: RuntimeNode, id: string): void {
    const recorder = this.recorder;
    const original = rn.send.bind(rn);
    rn.send = (arg: unknown) => {
      if (Array.isArray(arg)) {
        arg.forEach((m, port) => {
          if (m != null) recorder.recordSent(id, port, m);
        });
      } else if (arg != null) {
        recorder.recordSent(id, 0, arg);
      }
      return original(arg);
    };
  }
}

export { Flow, NodeRef };
export type { AddNodeOptions, ReadOptions };
