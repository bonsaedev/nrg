import { vi } from "vitest";

interface MockREDOptions {
  nodes?: Record<string, any>;
  settings?: Record<string, any>;
}

function createMockRED(options: MockREDOptions = {}) {
  const { nodes = {}, settings = {} } = options;

  return {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    nodes: {
      getNode: vi.fn((id: string) => nodes[id]),
      registerType: vi.fn(),
      createNode: vi.fn(),
    },
    httpAdmin: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      use: vi.fn(),
    },
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
    },
    events: {
      on: vi.fn(),
      emit: vi.fn(),
    },
    hooks: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    version: vi.fn(() => "0.0.0-test"),
  } as any;
}

function getProperty(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

interface MockNodeRedNodeOptions {
  id?: string;
  type?: string;
  name?: string;
  z?: string;
  wires?: string[][];
  credentials?: Record<string, any>;
  [key: string]: any;
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

function createMockNodeRedNode(options: MockNodeRedNodeOptions = {}) {
  const nodeCtx = createContextStore();
  const flowCtx = createContextStore();
  const globalCtx = createContextStore();

  const context = {
    ...nodeCtx,
    flow: flowCtx,
    global: globalCtx,
  };

  return {
    id: options.id ?? `test-${Math.random().toString(36).slice(2, 10)}`,
    type: options.type ?? "test-node",
    name: options.name ?? "",
    z: options.z ?? "flow-1",
    x: 100,
    y: 200,
    g: undefined,
    wires: options.wires ?? [[]],
    credentials: options.credentials ?? {},
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
    updateWires: vi.fn(),
    receive: vi.fn(),
    context: vi.fn(() => context),
    ...options,
  } as any;
}

export { createMockRED, createMockNodeRedNode };
export type { MockREDOptions, MockNodeRedNodeOptions };
