import { vi } from "vitest";
import { createNodeRedRuntime, createNodeRedNode } from "./mocks";
import { initValidator } from "../core/server/validation";
import type { NodeRedNode } from "../core/server/types";
import type { NodeConstructor as NodeClass } from "../core/server/nodes/types/node";
import type { MockRED } from "./mocks";

interface CreateNodeOptions {
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  overrides?: Partial<NodeRedNode>;
}

type ExtractInput<T> = T extends { input(msg: infer I): any } ? I : any;
type ExtractOutput<T> = T extends { send(msg: infer O): any } ? O : any;

interface TestNodeHelpers<TInput = any, TOutput = any> {
  receive(msg: TInput): Promise<void>;
  close(removed?: boolean): Promise<void>;
  reset(): void;
  sent(): TOutput[];
  sent(port: number): any[];
  statuses(): any[];
  logged(level?: "info" | "warn" | "error" | "debug"): string[];
  warned(): string[];
  errored(): string[];
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
): T & TestNodeHelpers<ExtractInput<T>, ExtractOutput<T>> {
  const sentMessages: any[] = [];
  const statusCalls: any[] = [];

  nodeRedNode.send.mockImplementation((msg: any) => {
    sentMessages.push(msg);
  });

  nodeRedNode.status.mockImplementation((status: any) => {
    statusCalls.push(status);
  });

  const nodeRef = node as any;

  const helpers: TestNodeHelpers = {
    async receive(msg: any): Promise<void> {
      const sendFn = vi.fn((outMsg: any) => {
        nodeRedNode.send(outMsg);
      });
      await nodeRef._input(msg, sendFn);
    },
    async close(removed = false): Promise<void> {
      await nodeRef._closed(removed);
    },
    reset(): void {
      sentMessages.length = 0;
      statusCalls.length = 0;
      nodeRedNode.log.mockClear();
      nodeRedNode.warn.mockClear();
      nodeRedNode.error.mockClear();
    },
    sent(port?: number): any[] {
      if (port === undefined) return [...sentMessages];
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
  };

  return Object.assign(node as any, helpers);
}

function isConfigNode(NodeClass: any): boolean {
  return NodeClass.category === "config";
}

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

  const RED = createNodeRedRuntime({ settings });
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

  // Call the static registered() hook (mirrors what registerType does)
  await Promise.resolve(
    NodeClass._registered?.(RED) ?? NodeClass.registered?.(RED),
  );

  const node = new (NodeClass as any)(RED, nodeRedNode, config, credentials);
  const augmented = attachHelpers<InstanceType<T>>(node, nodeRedNode);

  await Promise.resolve(augmented.created?.());

  return { node: augmented, RED };
}

export { createNode };
