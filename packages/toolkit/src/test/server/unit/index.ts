import { vi } from "vitest";
import { createRED, createNodeRedNode } from "./mocks";
import { initValidator } from "@bonsae/nrg-runtime/internal/server";
import type { NodeRedNode } from "@bonsae/nrg-runtime/internal/server";
import type { NodeConstructor as NodeClass } from "@bonsae/nrg-runtime/internal/server";
import type { MockRED } from "./mocks";
import { WIRE_HANDLERS } from "@bonsae/nrg-runtime/internal/server";
import type { NodeContextStore } from "@bonsae/nrg-runtime/internal/server";
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

interface TestNodeHelpers<TInput = any, TOutput = any> {
  receive(msg: TInput): Promise<void>;
  close(removed?: boolean): Promise<void>;
  reset(): void;
  sent(): TOutput[];
  sent<P extends PortNames<TOutput>>(port: P): PortMessage<TOutput, P>[];
  sent(port: number): any[];
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
      if (typeof port === "string") {
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
        return sentMessages
          .map((msg) => (Array.isArray(msg) ? msg[idx] : undefined))
          .filter((msg) => msg != null);
      }
      return sentMessages
        .map((msg) =>
          Array.isArray(msg) ? msg[port] : port === 0 ? msg : undefined,
        )
        .filter((msg) => msg != null);
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
