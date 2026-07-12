import { vi } from "vitest";
import type { RED, NodeRedNode } from "@/sdk/lib/server/red";
import type { INode } from "@/sdk/lib/server/nodes";

interface MockRED extends RED {
  registerNode(id: string, nodeRedNode: Partial<NodeRedNode>): void;
  registerNrgNode(id: string, nrgInstance: Partial<INode>): void;
}

function createRED(options: { settings?: Record<string, any> } = {}): MockRED {
  const { settings = {} } = options;
  const nodes: Record<string, any> = {};
  const credentials: Record<string, Record<string, any>> = {};

  const red = {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      log: vi.fn(),
      metric: vi.fn(() => false),
      audit: vi.fn(),
      addHandler: vi.fn(),
      removeHandler: vi.fn(),
      FATAL: 10,
      ERROR: 20,
      WARN: 30,
      INFO: 40,
      DEBUG: 50,
      TRACE: 60,
      AUDIT: 98,
      METRIC: 99,
    },
    nodes: {
      getNode: vi.fn((id: string) => nodes[id]),
      registerType: vi.fn(),
      createNode: vi.fn(),
      getCredentials: vi.fn((id: string) => credentials[id]),
      addCredentials: vi.fn((id: string, creds: Record<string, any>) => {
        credentials[id] = { ...credentials[id], ...creds };
      }),
      eachNode: vi.fn(),
      getType: vi.fn(),
      getNodeInfo: vi.fn(),
      getNodeList: vi.fn(() => []),
      getModuleInfo: vi.fn(),
      installModule: vi.fn(),
      uninstallModule: vi.fn(),
      enableNode: vi.fn(),
      disableNode: vi.fn(),
    },
    httpAdmin: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      use: vi.fn(),
    } as any,
    httpNode: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      use: vi.fn(),
    } as any,
    hooks: {
      add: vi.fn(),
      remove: vi.fn(),
      trigger: vi.fn(),
      has: vi.fn(() => false),
      clear: vi.fn(),
    },
    events: {
      on: vi.fn(),
      emit: vi.fn(),
      removeListener: vi.fn(),
    } as any,
    settings: { ...settings },
    _: vi.fn((key: string, subs?: Record<string, string>) => {
      if (!subs) return key;
      return Object.entries(subs).reduce(
        (str, [k, v]) => str.replace(`__${k}__`, v),
        key,
      );
    }),
    util: {
      evaluateNodeProperty: vi.fn(
        (
          value: any,
          type: string,
          _node: any,
          msg: any,
          callback: (err: Error | null, result: any) => void,
        ) => {
          try {
            let result: any;
            switch (type) {
              case "str":
                result = String(value);
                break;
              case "num":
                result = Number(value);
                break;
              case "bool":
                result = value === "true" || value === true;
                break;
              case "json":
                result = typeof value === "string" ? JSON.parse(value) : value;
                break;
              case "msg":
                result = msg ? getProperty(msg, value) : undefined;
                break;
              case "date":
                result = Date.now();
                break;
              case "bin":
                result = Buffer.from(value ?? "");
                break;
              case "re":
                result = new RegExp(value);
                break;
              case "jsonata":
              case "flow":
              case "global":
              case "env":
              case "cred":
                result = undefined;
                break;
              case "node":
                result = value;
                break;
              default:
                result = value;
            }
            callback(null, result);
          } catch (err) {
            callback(err as Error, undefined);
          }
        },
      ),
      generateId: vi.fn(() => "mock-id"),
      cloneMessage: vi.fn((msg: any) => structuredClone(msg)),
      ensureString: vi.fn((o: any) => String(o)),
      ensureBuffer: vi.fn(),
      compareObjects: vi.fn(),
      getMessageProperty: vi.fn((msg: any, prop: string) =>
        getProperty(msg, prop),
      ),
      setMessageProperty: vi.fn(
        (msg: any, prop: string, value: any, createMissing?: boolean) =>
          setProperty(msg, prop, value, createMissing ?? false),
      ),
      getObjectProperty: vi.fn(),
      setObjectProperty: vi.fn(),
      normalisePropertyExpression: vi.fn(),
      normaliseNodeTypeName: vi.fn(),
      prepareJSONataExpression: vi.fn(),
      evaluateJSONataExpression: vi.fn(),
      parseContextStore: vi.fn(),
      getSetting: vi.fn(),
      encodeObject: vi.fn(),
    },
    version: vi.fn(() => "0.0.0-test"),
    // Both are populated by globals `init()` via non-enumerable getters.
    validator: undefined as any,
    channelStore: undefined as any,
    registerNode(id: string, nodeRedNode: Partial<NodeRedNode>) {
      nodes[id] = nodeRedNode;
    },
    registerNrgNode(id: string, nrgInstance: Partial<INode>) {
      nodes[id] = createNodeRedNode({ id, _node: nrgInstance as INode });
    },
  } as MockRED;

  return red;
}

function getProperty(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function setProperty(
  obj: any,
  path: string,
  value: any,
  createMissing: boolean,
): boolean {
  const keys = path.split(".");
  let target = obj;
  for (const key of keys.slice(0, -1)) {
    if (target[key] == null || typeof target[key] !== "object") {
      if (!createMissing) return false;
      target[key] = {};
    }
    target = target[key];
  }
  target[keys[keys.length - 1]] = value;
  return true;
}

function createContextStore() {
  const store: Record<string, any> = {};
  return {
    get: vi.fn(
      (
        key: string,
        _store: string | undefined,
        cb: (err: any, val?: any) => void,
      ) => cb(null, store[key]),
    ),
    set: vi.fn(
      (
        key: string,
        value: any,
        _store: string | undefined,
        cb: (err: any) => void,
      ) => {
        store[key] = value;
        cb(null);
      },
    ),
    keys: vi.fn(
      (_store: string | undefined, cb: (err: any, keys?: string[]) => void) =>
        cb(null, Object.keys(store)),
    ),
  };
}

function createNodeRedNode(options: Partial<NodeRedNode> = {}): NodeRedNode {
  const nodeCtx = createContextStore();
  const flowCtx = createContextStore();
  const globalCtx = createContextStore();

  const context = {
    ...nodeCtx,
    flow: flowCtx,
    global: globalCtx,
  };

  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  return {
    id: options.id ?? `node-${Math.random().toString(36).slice(2, 10)}`,
    type: options.type ?? "test-node",
    name: options.name ?? "test-node",
    z: options.z ?? "flow-1",
    x: 100,
    y: 200,
    g: "group-1",
    wires: options.wires ?? [["node-2"]],
    credentials: options.credentials ?? {},
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    emit: vi.fn(async (event: string, ...args: any[]) => {
      for (const handler of handlers.get(event) ?? []) {
        await handler(...args);
      }
    }),
    send: vi.fn(),
    status: vi.fn(),
    updateWires: vi.fn(),
    receive: vi.fn(),
    context: vi.fn(() => context),
    ...options,
  } as NodeRedNode;
}

export { createRED, createNodeRedNode, createContextStore };
export type { MockRED };
