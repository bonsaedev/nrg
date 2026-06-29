import { vi } from "vitest";
import { createRED, createNodeRedNode } from "./mocks";
import { initValidator } from "../../../core/server/validation";
import type { NodeRedNode } from "../../../core/server/nodered";
import type { NodeConstructor as NodeClass } from "../../../core/server/nodes/types/node";
import type { MockRED } from "./mocks";
import { WIRE_HANDLERS } from "../../../core/server/nodes/symbols";
import type { NodeContextStore } from "../../../core/server/nodes/types/node";
import { Kind } from "@sinclair/typebox";

interface CreateNodeOptions {
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  overrides?: Partial<NodeRedNode>;
}

type ExtractInput<T> = T extends { input(msg: infer I): any } ? I : any;
type ExtractOutput<T> = T extends { send(msg: infer O): any } ? O : any;

type PortNames<T> = [T] extends [Record<string, Record<string, any>>]
  ? string extends keyof T
    ? never
    : keyof T & string
  : never;

type PortMessage<T, P extends string> =
  T extends Record<string, any> ? (P extends keyof T ? T[P] : never) : never;

/** True only for `any` (distributes via the `1 & T` trick). */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * A single delivered port message. The default return key `"output"` holds the
 * declared value `V`; carry/trace mode also spread the incoming message, so the
 * node's declared input keys may be present (typed optional). Extra keys are
 * derived from the node — never `unknown` — and an `any` input collapses to just
 * the precisely typed `output`.
 */
type WrappedPort<V, TInput> = { output: V } & (unknown extends TInput
  ? unknown
  : Partial<TInput>);

/**
 * The positional fan-out the runtime delivers for one emission — one wrapped
 * slot per declared base output port, derived from the node's output type:
 * - a tuple `outputsSchema` → a precise positional tuple (`[i][0]`, `[i][1]`, …);
 * - a single `outputsSchema` → a one-slot tuple (`[i][0]`);
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
      : [TOutput] extends [Record<string, Record<string, any>>]
        ? keyof TOutput extends never
          ? [WrappedPort<TOutput, TInput>]
          : string extends keyof TOutput
            ? WrappedPort<unknown, TInput>[]
            : WrappedPort<TOutput[keyof TOutput], TInput>[]
        : [WrappedPort<TOutput, TInput>];

type NodeSource = { id: string; type: string; name: string };

/** Message delivered on the built-in **error** port (`sent("error")`). A thrown
 * error's own enumerable fields ride alongside the canonical `name`/`message`/
 * `source`. */
type ErrorPortMessage = {
  error: { name: string; message: string; source: NodeSource };
} & Record<string, unknown>;

/** Message delivered on the built-in **complete** port (`sent("complete")`).
 * Carries `output` when `input()` returned a value. */
type CompletePortMessage = {
  complete: { source: NodeSource };
} & Record<string, unknown>;

/** Message delivered on the built-in **status** port (`sent("status")`). */
type StatusPortMessage = {
  status: { fill?: string; shape?: string; text?: string };
  source: NodeSource;
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
  sent(port: "error"): ErrorPortMessage[];
  sent(port: "complete"): CompletePortMessage[];
  sent(port: "status"): StatusPortMessage[];
  sent<P extends PortNames<TOutput>>(
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

  const helpers: TestNodeHelpers = {
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
        const schema = NodeClass.outputsSchema;
        if (
          !schema ||
          Array.isArray(schema) ||
          (typeof schema === "object" && Kind in schema)
        ) {
          return [];
        }
        const idx = Object.keys(schema).indexOf(port);
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
    // expose the node's own (already promise-wrapped) context stores; the
    // node keeps using the same object internally, callable form included
    context: (node as unknown as { context: TestNodeContext }).context,
  };

  return Object.assign(node as any, helpers);
}

function isConfigNode(NodeClass: any): boolean {
  return NodeClass.category === "config";
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
  if (isConfigNode(NodeClass)) {
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

  // Wire up event handlers (same path as production)
  const createdPromise = Promise.resolve(node.created?.());
  node[WIRE_HANDLERS](nodeRedNode, createdPromise);
  await createdPromise;

  return { node: augmented, RED };
}

export { createNode };
export { createRED } from "./mocks";
export type { MockRED } from "./mocks";
