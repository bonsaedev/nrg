import { vi } from "vitest";
import { createRED, createNodeRedNode } from "./mocks";
import { ensurePortTopology } from "../port-topology";
import { initValidator } from "@/sdk/lib/server/validation";
import type { NodeRedNode } from "@/sdk/lib/server/red";
import type { NodeConstructor as NodeClass } from "@/sdk/lib/server/nodes";
import type { MockRED } from "./mocks";
import {
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
} from "@/sdk/lib/server/nodes/symbols";
import type { NodeContextStore } from "@/sdk/lib/server/nodes/types/node";
import type {
  ErrorPortOutput as CoreErrorPortOutput,
  CompletePortOutput as CoreCompletePortOutput,
  StatusPortOutput as CoreStatusPortOutput,
  NamedPortsBrand,
  OutputPortNames,
  PortValue,
  IsAny,
} from "@/sdk/lib/server/nodes/types/ports";

interface CreateNodeOptions {
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  overrides?: Partial<NodeRedNode>;
}

type ExtractInput<T> = T extends { input(msg: infer I): any } ? I : any;
type ExtractOutput<T> = T extends { send(msg: infer O): any } ? O : any;

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
 */
type WrappedPort<V, TInput> = { output: V } & ([TInput] extends [never]
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
    : TOutput extends readonly [any, ...any[]]
      ? { [K in keyof TOutput]: WrappedPort<TOutput[K], TInput> }
      : [TOutput] extends [NamedPortsBrand]
        ? [Exclude<keyof TOutput, keyof NamedPortsBrand>] extends [never]
          ? [WrappedPort<Omit<TOutput, keyof NamedPortsBrand>, TInput>]
          : WrappedPort<
              TOutput[Exclude<keyof TOutput, keyof NamedPortsBrand>],
              TInput
            >[]
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

interface TestNodeHelpers<TInput = any, TOutput = any> {
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
  /** All raw emissions, each a positional array — `sent()[i][0]` is port 0 of
   * emission `i`, typed from the node's declared output. Read one port directly
   * with `sent(name)` / `sent(port)`, including the built-in lifecycle ports by
   * name: `sent("error")`, `sent("complete")`, `sent("status")`. */
  sent(): PortTuple<TOutput, TInput>[];
  sent(port: "error"): ErrorPortOutput[];
  sent(port: "complete"): CompletePortOutput[];
  sent(port: "status"): StatusPortOutput[];
  sent<P extends OutputPortNames<TOutput>>(
    port: P,
  ): WrappedPort<PortMessage<TOutput, P>, TInput>[];
  sent(port: number): WrappedPort<unknown, TInput>[];
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
  node: T & TestNodeHelpers<ExtractInput<T>, ExtractOutput<T>>;
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
): T & TestNodeHelpers<ExtractInput<T>, ExtractOutput<T>> {
  const sentMessages: any[] = [];
  const statusCalls: any[] = [];

  nodeRedNode.send.mockImplementation((msg: any) => {
    sentMessages.push(msg);
  });

  nodeRedNode.status.mockImplementation((status: any) => {
    statusCalls.push(status);
  });

  // `context` is intentionally omitted — it's already set as an own property on
  // the node itself, so leaving it out of this `Object.assign` source keeps the
  // real context intact and exposed on the returned node.
  const helpers: Omit<TestNodeHelpers, "context"> = {
    async receive(msg: any): Promise<void> {
      const sendFn = vi.fn((outMsg: any) => {
        nodeRedNode.send(outMsg);
      });
      const doneFn = vi.fn();
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
