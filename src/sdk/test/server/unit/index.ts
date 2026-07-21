import { vi } from "vitest";
import { createRED, createNodeRedNode } from "./mocks";
import { ensurePortTopology } from "../port-topology";
import { initValidator } from "@/sdk/lib/server/init";
import type { NodeRedNode } from "@/sdk/lib/server/node-red";
import type { NodeConstructor as NodeClass } from "@/sdk/lib/server/nodes";
import type { MockRED } from "./mocks";
import type { NodeContextStore } from "@/sdk/lib/server/nodes/types/node";
import type {
  ErrorPortOutput as CoreErrorPortOutput,
  CompletePortOutput as CoreCompletePortOutput,
  StatusPortOutput as CoreStatusPortOutput,
  PortValue,
  Port,
  IsPortRecord,
  IsAny,
  MessageMetadata,
} from "@/sdk/lib/server/nodes/types/ports";

interface CreateNodeOptions {
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  overrides?: Partial<NodeRedNode>;
}

// The node's WIRE input type — read from the node's OWN `receive(msg)` parameter,
// which the base IONode types as `TInput` straight from the CLASS generic. Reading
// `input()`'s parameter instead
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

// The message a named port carries: unwrap the port's `Port<T>` to its `T` (a
// non-Port value passes through `PortValue` unchanged).
type PortMessage<T, P extends string> =
  T extends Record<string, any>
    ? P extends keyof T
      ? PortValue<T[P]>
      : never
    : never;

/**
 * A single emitted frame: the port's declared additions `V` merged onto the
 * incoming record. `V`'s fields are precisely typed; the node's declared input
 * keys may also be present (merge carries them), so they're spread as optional.
 * An `any`/`unknown` input means the node reads no specific field but (in merge
 * mode) carries EVERY incoming field, so arbitrary carried fields stay readable
 * as `Record<string, unknown>`. A `never` input (a SOURCE node: no input port, so
 * it carries no incoming message) adds nothing — without the guard `Partial<never>`
 * would poison the intersection to `never`, making the frame unreadable.
 *
 * `& WithMetaField`: the runtime stamps the `_meta` provenance carrier on every
 * emitted data-port frame, so a producer test can read `sent(0)[0]._meta.source`. It
 * rides data-port frames only, never the built-in error/complete/status frames.
 */
type WithMetaField = { _meta: MessageMetadata };
type WrappedPort<V, TInput> = V &
  WithMetaField &
  ([TInput] extends [never]
    ? unknown
    : unknown extends TInput
      ? Record<string, unknown>
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
          ? // named ports: one slot per port; each carries that port's value. A
            // single-key record collapses to a precise one-value union
            // (`sent()[i][0].output`); a multi-key record is the sound union of
            // its ports' values — use `sent(name)` for a precise single port.
            WrappedPort<PortValue<TOutput[keyof TOutput]>, TInput>[]
          : [WrappedPort<TOutput, TInput>];

// Built-in port output shapes come from the runtime (single source of truth) — the
// mock only layers on the test-delivery semantics: real emissions also spread
// the input message and custom props (`& Record<string, unknown>`), and the
// status port is narrowed to the object form the assertions read (the runtime
// union also allows a bare string, which these helpers never surface).
// The framework spreads a thrown error's OWN enumerable fields onto `msg.error`
// (a custom error's `code`, etc.); the harness can't know them per-node, so the
// `error` object also carries arbitrary fields as `unknown` — readable, cast-free.
type ErrorPortOutput = Omit<CoreErrorPortOutput, "error"> & {
  error: CoreErrorPortOutput["error"] & Record<string, unknown>;
} & Record<string, unknown>;
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
): T & TestNodeHelpers<ExtractInput<T>> {
  const sentMessages: any[] = [];
  const statusCalls: any[] = [];

  nodeRedNode.send.mockImplementation((msg: any) => {
    // The runtime already stamped the `_meta` provenance carrier on each frame — a
    // plain enumerable key — so a producer test reads `sent(0)[0]._meta.source`
    // directly, no install needed.
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
    async receive(msg: any): Promise<void> {
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
  );

  // The node self-schedules `created()` (a microtask) and self-wires its OWN
  // Node-RED `close`/`input` events in its constructor — the same path production
  // takes, so the harness wires nothing. It only OBSERVES `created()`'s outcome via
  // the node's own `createdPromise`: a rejection does NOT abort construction (the
  // node is still returned); it's surfaced as the result's `error`, and any
  // status/send calls made during `created()` are captured because the helpers were
  // attached above.
  let error: unknown;
  await node.createdPromise.catch((err) => {
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
  PortValue,
  Port,
} from "@/sdk/lib/server/nodes/types/ports";
