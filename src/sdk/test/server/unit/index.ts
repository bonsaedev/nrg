import { vi } from "vitest";
import { createRED, createNodeRedNode } from "./mocks";
import { ensurePortTopology } from "../port-topology";
import { initValidator, initLaneStore } from "@/sdk/lib/server/init";
import { laneProxy, packageLane } from "@/sdk/lib/server/lane-store";
import type { NodeRedNode } from "@/sdk/lib/server/red";
import type { NodeConstructor as NodeClass } from "@/sdk/lib/server/nodes";
import type { MockRED } from "./mocks";
import {
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
  NRG_PROTECTED_LANE,
} from "@/sdk/lib/server/symbols";
import type { NodeContextStore } from "@/sdk/lib/server/nodes/types/node";
import type {
  ErrorPortOutput as CoreErrorPortOutput,
  CompletePortOutput as CoreCompletePortOutput,
  StatusPortOutput as CoreStatusPortOutput,
  PortValue,
  Port,
  IsPortRecord,
  IsAny,
  MessageLanes,
  MessageMeta,
} from "@/sdk/lib/server/nodes/types/ports";

interface CreateNodeOptions {
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  overrides?: Partial<NodeRedNode>;
}

// The node's WIRE input type — read from the node's OWN `receive(msg)` parameter,
// which the base IONode types as `OmitMessageLanes<TInput>` straight from the CLASS
// generic (already lanes-/`_msgid`-free). Reading `input()`'s parameter instead
// collapses to `unknown` for the idiomatic no-argument `input()` style (a zero-arg
// method still satisfies `{ input(msg: infer I) }` with `I = unknown`), which would
// make `receive()` silently accept any value — the same lossiness that keeps
// `TOutput` off the node class, so we recover the wire from `receive` (typed from
// the in-scope generic) exactly as `sent()` recovers `TOutput` from the shim.
type ExtractInput<T> = T extends { receive(msg: infer M): any } ? M : any;
// `sent()` is typed from the node's declared `TOutput` — but `TOutput` can't be
// recovered from a passed node class (the constrained `send(port, value)`
// signature keeps it only inside conditional types like `OutputPortNames<TOutput>`,
// which TS won't run backwards). So `sent()` is declared right on `IONode`, where
// `TOutput`/`TInput` are in scope, via the `sent-augment.d.ts` shim — loaded by
// the base TEST tsconfigs (test-only; absent from a production build). It is
// therefore already on the returned node and is NOT part of `TestNodeHelpers`.

// The message a named port carries: unwrap a `Port<T>` to its `T` (a schema-
// derived branded record isn't wrapped, so `PortValue` passes it through).
type PortMessage<T, P extends string> =
  T extends Record<string, any>
    ? P extends keyof T
      ? PortValue<T[P]>
      : never
    : never;

/**
 * A single delivered port message. The default return key `"output"` holds the
 * declared value `V`; carry/trace mode also spread the incoming message, so the
 * node's declared input keys may be present (typed optional). Extra keys are
 * derived from the node — never `unknown` — and an `any` input collapses to just
 * the precisely typed `output`. A `never` input (a SOURCE node: no input port,
 * so it emits from outside any `input()` and carries no incoming message) also
 * collapses to just `{ output: V }` — without this guard `Partial<never>` would
 * poison the intersection to `never`, making `sent()[i][0].output` unreadable.
 *
 * `& MessageLanes`: the harness exposes the off-the-wire lanes on each emitted
 * frame — `private` in the PRODUCER's own package partition, so it reads back what
 * a SAME-package downstream node would see (a different package reads its own,
 * empty partition). A producer test asserts `sent(0)[0].protected.x` /
 * `sent(0)[0].private.x` (the data the node emitted via
 * `send(msg, protected, private)`). The lanes are non-enumerable, so
 * `toEqual({ output })` still matches. They ride data-port frames only, never the
 * built-in error/complete/status frames.
 */
type WrappedPort<V, TInput> = { output: V } & MessageLanes &
  ([TInput] extends [never]
    ? unknown
    : unknown extends TInput
      ? unknown
      : Partial<TInput>);

/**
 * The positional fan-out the runtime delivers for one emission — one wrapped
 * slot per declared base output port, derived from the node's `Output` generic:
 * - a tuple `Output` → a precise positional tuple (`[i][0]`, `[i][1]`, …);
 * - a single `Output` → a one-slot tuple (`[i][0]`);
 * - a named-port record → a sound per-port union (use `sent(name)` for precise
 *   named access — record key order is not recoverable at the type level).
 *
 * Built-in lifecycle ports (error/complete/status) occupy slots beyond the
 * declared ports and are intentionally not part of this typed shape.
 */
type PortTuple<TOutput, TInput> =
  IsAny<TOutput> extends true
    ? any[]
    : [TOutput] extends [never]
      ? never[]
      : TOutput extends readonly Port<any>[]
        ? // dynamic ports: N slots, each carrying the element `Port`'s value
          WrappedPort<PortValue<TOutput[number]>, TInput>[]
        : IsPortRecord<TOutput> extends true
          ? // named ports: one slot per port; each carries that port's value.
            // A single-key record collapses to a precise one-value union
            // (`sent()[i][0].output`); a multi-key record is the sound union of
            // its ports' values — use `sent(name)` for a precise single port.
            WrappedPort<PortValue<TOutput[keyof TOutput]>, TInput>[]
          : [WrappedPort<TOutput, TInput>];

// Built-in port output shapes come from the runtime (single source of truth) — the
// mock only layers on the test-delivery semantics: real emissions also spread
// the input message and custom props (`& Record<string, unknown>`), and the
// status port is narrowed to the object form the assertions read (the runtime
// union also allows a bare string, which these helpers never surface).
type ErrorPortOutput = CoreErrorPortOutput & Record<string, unknown>;
type CompletePortOutput = CoreCompletePortOutput & Record<string, unknown>;
type StatusPortOutput = Omit<CoreStatusPortOutput, "status"> & {
  status: Extract<CoreStatusPortOutput["status"], object>;
} & Record<string, unknown>;

/**
 * Resolve a built-in lifecycle port name to its positional slot for `sent()`.
 * Built-in ports are appended after the declared base outputs in a fixed order
 * (error, complete, status), each present only when its config flag is on.
 * Returns `undefined` for a non-built-in name (fall through to declared ports),
 * or `-1` when the named built-in port is disabled.
 */
function builtinPortIndex(node: any, name: string): number | undefined {
  if (name !== "error" && name !== "complete" && name !== "status") {
    return undefined;
  }
  // Reached only for built-in port names, which are only meaningful on an
  // IONode — so config (an object) and baseOutputs (a number) are always set.
  const config = node.config;
  const base = node.baseOutputs;
  if (name === "error") return config.errorPort ? base : -1;
  let index = base + (config.errorPort ? 1 : 0);
  if (name === "complete") return config.completePort ? index : -1;
  index += config.completePort ? 1 : 0;
  return config.statusPort ? index : -1;
}

interface TestNodeHelpers<TInput = any> {
  /** Drive the node's input handler with a Node-RED message. For an object
   * input the declared shape is required while arbitrary extra message
   * properties (`topic`, `_msgid`, correlation ids, …) are allowed — a real
   * Node-RED message always carries more than the validated input schema. A
   * non-object input type passes through unchanged. */
  receive(
    msg: TInput extends object ? TInput & Record<string, unknown> : TInput,
    lanes?: LaneInput,
  ): Promise<void>;
  close(removed?: boolean): Promise<void>;
  reset(): void;
  // `sent()` lives on IONode via the `sent-augment.d.ts` shim (so it types from
  // the node's in-scope `TOutput`); it is already present on the returned node and
  // intentionally NOT re-declared here.
  statuses(): any[];
  logged(level?: "info" | "warn" | "error" | "debug"): string[];
  warned(): string[];
  errored(): string[];
  /** Promise-based access to the node's context stores (node / flow / global). */
  context: TestNodeContext;
}

interface TestNodeContext {
  node: NodeContextStore;
  flow?: NodeContextStore;
  global: NodeContextStore;
}

/**
 * The off-the-wire lanes an UPSTREAM node would have attached to the incoming
 * message, passed as the second `receive()` argument so the node under test reads
 * them via `msg.protected.*` / `msg.private.*`. `private` is placed in the node's
 * OWN package partition (what the node sees). Mirrors the producer side: what one
 * node passes to `send(msg, protected, private)` is what the next receives here.
 *
 * @example
 * // consumer: given a live `res` on the private lane, it should reply
 * await node.receive({ _msgid: "r1", payload: { ok: true } }, { private: { res } });
 * expect(res.end).toHaveBeenCalled();
 */
interface LaneInput {
  protected?: Record<string, unknown>;
  private?: Record<string, unknown>;
}

/**
 * Bridges a node's off-the-wire lanes to the test, scoped like the node itself:
 * shared `protected`, and `private` in the node's own package partition. `seed`
 * writes incoming lanes (for `receive`'s second arg); `expose` installs the
 * non-enumerable `protected` / `private` accessors on an emitted frame so a test
 * can read what the node sent. Both key off the message's `_msgid`.
 */
interface LaneBridge {
  seed(msg: { _msgid?: string }, lanes: LaneInput): void;
  expose(frame: unknown): void;
}

interface CreateNodeResult<T> {
  node: T & TestNodeHelpers<ExtractInput<T>>;
  RED: MockRED;
  /** The error thrown by `created()`, if any — `undefined` when it succeeded.
   * `createNode` never rejects on a failing `created()` (production constructs
   * the node regardless and surfaces the error on the first input via `done`);
   * assert it here instead. */
  error: unknown;
}

function buildConfig(
  NodeClass: NodeClass,
  userConfig: Record<string, any> = {},
) {
  const defaults: Record<string, any> = {};

  if (NodeClass.configSchema?.properties) {
    for (const [key, prop] of Object.entries(
      NodeClass.configSchema.properties,
    )) {
      const schemaProp = prop as { default?: unknown };
      if (schemaProp.default !== undefined) {
        defaults[key] = schemaProp.default;
      }
    }
  }

  return { ...defaults, ...userConfig };
}

function attachHelpers<T>(
  node: T,
  nodeRedNode: any,
  NodeClass: NodeClass,
  laneBridge: LaneBridge,
): T & TestNodeHelpers<ExtractInput<T>> {
  const sentMessages: any[] = [];
  const statusCalls: any[] = [];

  nodeRedNode.send.mockImplementation((msg: any) => {
    // Expose the off-the-wire lanes on each emitted frame — as a SAME-package
    // downstream node would read them (`private` uses the producer's own package
    // partition) — so a producer test asserts what it sent via
    // `sent(0)[0].protected.x` / `sent(0)[0].private.x`.
    (Array.isArray(msg) ? msg : [msg]).forEach(laneBridge.expose);
    sentMessages.push(msg);
  });

  nodeRedNode.status.mockImplementation((status: any) => {
    statusCalls.push(status);
  });

  // `context` is intentionally omitted — it's already set as an own property on
  // the node itself, so leaving it out of this `Object.assign` source keeps the
  // real context intact and exposed on the returned node. `sent` is typed on
  // IONode via the shim (not part of `TestNodeHelpers`); its runtime impl is
  // attached here with a loose signature — the precise overloads come from the shim.
  const helpers: Omit<TestNodeHelpers, "context"> & {
    sent(port?: number | string): any[];
  } = {
    async receive(msg: any, lanes?: LaneInput): Promise<void> {
      // Seed the incoming message's off-the-wire lanes (as an upstream node would
      // have) so the node reads them via `msg.protected` / `msg.private`.
      if (lanes) laneBridge.seed(msg, lanes);
      const sendFn = vi.fn((outMsg: any) => {
        nodeRedNode.send(outMsg);
      });
      // Mirror Node-RED's runtime: `done(err)` routes through `Node._complete`
      // → `node.error(err, msg)`, so a failure surfaces on the error log exactly
      // as real Node-RED would. The io-node runtime relies on this for the
      // no-error-port path (it does NOT call `node.error` itself there — pairing
      // that with `done(err)` is the classic double-report).
      const doneFn = vi.fn((err?: unknown) => {
        if (err instanceof Error) nodeRedNode.error(err.message, msg);
      });
      await nodeRedNode.emit("input", msg, sendFn, doneFn);
      if (doneFn.mock.calls[0]?.[0] instanceof Error) {
        throw doneFn.mock.calls[0][0];
      }
    },
    async close(removed = false): Promise<void> {
      const doneFn = vi.fn();
      await nodeRedNode.emit("close", removed, doneFn);
      if (doneFn.mock.calls[0]?.[0] instanceof Error) {
        throw doneFn.mock.calls[0][0];
      }
    },
    reset(): void {
      sentMessages.length = 0;
      statusCalls.length = 0;
      nodeRedNode.log.mockClear();
      nodeRedNode.warn.mockClear();
      nodeRedNode.error.mockClear();
    },
    sent(port?: number | string): any[] {
      if (port === undefined) return [...sentMessages];
      const pluck = (idx: number) =>
        sentMessages
          .map((msg) => (Array.isArray(msg) ? msg[idx] : undefined))
          .filter((msg) => msg != null);
      if (typeof port === "string") {
        // Built-in lifecycle ports (error/complete/status) resolve to their
        // positional slot beyond the declared ports.
        const builtin = builtinPortIndex(node, port);
        if (builtin !== undefined) return builtin === -1 ? [] : pluck(builtin);
        // Custom named ports: resolve via the class getter, which reads the
        // type-derived names (injected `__nrgPorts`) — so a types-only `Port<T>`
        // node resolves by name.
        const names = (NodeClass as { outputPortNames?: string[] })
          .outputPortNames;
        const idx = names?.indexOf(port) ?? -1;
        if (idx === -1) return [];
        return pluck(idx);
      }
      return pluck(port);
    },
    statuses() {
      return [...statusCalls];
    },
    logged(level?: "info" | "warn" | "error" | "debug") {
      if (level) {
        return nodeRedNode[level === "info" ? "log" : level].mock.calls.map(
          (c: any[]) => c[0],
        );
      }
      return [
        ...nodeRedNode.log.mock.calls.map((c: any[]) => c[0]),
        ...nodeRedNode.warn.mock.calls.map((c: any[]) => c[0]),
        ...nodeRedNode.error.mock.calls.map((c: any[]) => c[0]),
      ];
    },
    warned() {
      return nodeRedNode.warn.mock.calls.map((c: any[]) => c[0]);
    },
    errored() {
      return nodeRedNode.error.mock.calls.map((c: any[]) => c[0]);
    },
  };

  return Object.assign(node as any, helpers);
}

/**
 * Creates a node instance for testing, with helpers for sending messages,
 * inspecting output, and checking status/log calls.
 *
 * @example
 * ```ts
 * const { node } = await createNode(MyNode, {
 *   config: { name: "test" },
 * });
 * await node.receive({ payload: "hello" });
 * expect(node.sent(0)).toEqual([{ payload: "HELLO" }]);
 * ```
 */
async function createNode<T extends NodeClass>(
  NodeClass: T,
  options: CreateNodeOptions = {},
): Promise<CreateNodeResult<InstanceType<T>>> {
  const {
    config: userConfig = {},
    credentials = {},
    settings = {},
    overrides: overrideOpts = {},
  } = options;

  // Behave like a built node: stamp the type-derived port topology the build
  // would inject, so a types-only node routes its base and built-in
  // error/complete/status ports at the right indices. No-op for a node that
  // already carries it or has no type-derived ports. (port-topology.ts)
  ensurePortTopology(NodeClass);

  // Extract config node instances passed directly in config values
  const resolvedConfig: Record<string, any> = {};
  const configNodes: Record<string, any> = {};

  for (const [key, value] of Object.entries(userConfig)) {
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      "config" in value
    ) {
      configNodes[value.id] = value;
      resolvedConfig[key] = value.id;
    } else {
      resolvedConfig[key] = value;
    }
  }

  const RED = createRED({ settings });
  // Just the globals — a unit test serves no HTTP, and the route/asset code uses
  // `__dirname`, invalid in the harness's ESM bundle.
  initValidator(RED);
  initLaneStore(RED);

  // Bridge the node's off-the-wire lanes to the test, scoped to the node's own
  // package for `private` (what the node reads/writes) and the shared partition
  // for `protected`.
  const laneStore = RED.laneStore;
  const lanePartition = packageLane(NodeClass);
  const laneBridge: LaneBridge = {
    seed(msg, lanes) {
      const msgid = msg._msgid;
      if (msgid == null) {
        // Lanes key off `_msgid`; seeding without one would silently go nowhere.
        throw new Error(
          "receive(): lanes were provided but the message has no `_msgid` — " +
            "lanes are keyed by `_msgid`, so nothing would be seeded. Give the " +
            "message an `_msgid` (e.g. receive({ _msgid: 'sig-1', ... }, lanes)).",
        );
      }
      if (lanes.protected)
        laneStore.merge(msgid, NRG_PROTECTED_LANE, lanes.protected);
      if (lanes.private) laneStore.merge(msgid, lanePartition, lanes.private);
    },
    expose(frame) {
      if (frame == null || typeof frame !== "object") return;
      // A frame with no `_msgid` gets an inert lane view (laneProxy handles the
      // missing id) rather than keying the store by `undefined`.
      const msgid = (frame as { _msgid?: string })._msgid;
      Object.defineProperty(frame, "protected", {
        configurable: true,
        enumerable: false,
        get: () => laneProxy(laneStore, msgid, NRG_PROTECTED_LANE),
      });
      Object.defineProperty(frame, "private", {
        configurable: true,
        enumerable: false,
        get: () => laneProxy(laneStore, msgid, lanePartition),
      });
    },
  };

  for (const [id, value] of Object.entries(configNodes)) {
    RED.registerNrgNode(id, value);
  }

  const configDefaults: Record<string, any> = {
    id: overrideOpts.id ?? `test-${Math.random().toString(36).slice(2, 10)}`,
    type: NodeClass.type,
  };

  // ConfigNodes require _users array
  if (NodeClass.category === "config") {
    configDefaults._users = [];
  }

  const config = buildConfig(NodeClass, {
    ...configDefaults,
    ...resolvedConfig,
  });

  const nodeRedNode = createNodeRedNode({
    id: config.id,
    type: NodeClass.type,
    name: config.name ?? "",
    credentials,
    ...overrideOpts,
  });

  // Validate settings and call registered hook (mirrors what Node.register does)
  NodeClass.validateSettings(RED);
  await Promise.resolve(NodeClass.registered?.(RED));

  const node = new NodeClass(RED, nodeRedNode, config, credentials);

  // Attach helpers before created() so status/send calls during created() are captured
  const augmented = attachHelpers<InstanceType<T>>(
    node,
    nodeRedNode,
    NodeClass,
    laneBridge,
  );

  // Wire up event handlers (same path as production). `created()` is awaited so
  // a test can assert post-created state — but, like production, a rejection does
  // NOT abort construction: the node is still returned and the failure is
  // surfaced as the result's `error` (production defers it to the first input,
  // where the wire handler surfaces it through `done(err)`).
  const createdPromise = Promise.resolve(node.created?.());
  node[NRG_SETUP_CLOSE_HANDLER]();
  if (
    NRG_SETUP_INPUT_HANDLER in node &&
    typeof node[NRG_SETUP_INPUT_HANDLER] === "function"
  ) {
    node[NRG_SETUP_INPUT_HANDLER](createdPromise);
  }
  let error: unknown;
  await createdPromise.catch((err) => {
    error = err;
  });

  return { node: augmented, RED, error };
}

export { createNode };
export { createRED } from "./mocks";
export type { MockRED } from "./mocks";
// Type-only helpers consumed by the `sent()` module-augmentation shim
// (`sent-augment.d.ts`), which declares `sent()` on IONode itself from the node's
// in-scope `TOutput`. Exported so the shipped shim can reference them across the
// package boundary; not part of the everyday harness surface.
export type {
  PortTuple,
  WrappedPort,
  PortMessage,
  ExtractInput,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};
// Re-exported so the shim can source ALL its type deps from this one entry
// (resolvable in nrg's own tests via a path alias and in a consumer via the
// shipped package), rather than reaching into `@bonsae/nrg/server` internals.
export type {
  OutputPortNames,
  InputSpec,
  OutputSpec,
} from "@/sdk/lib/server/nodes/types/ports";
