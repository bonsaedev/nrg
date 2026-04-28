import { vi } from "vitest";

export function createMockRED(nodes: Record<string, any> = {}) {
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
      use: vi.fn(),
    },
    settings: {} as Record<string, any>,
    _: vi.fn((key: string) => key),
    util: {
      evaluateNodeProperty: vi.fn(),
    },
  } as any;
}

export function createMockNodeRedNode(overrides: Record<string, any> = {}) {
  const contextStore = {
    get: vi.fn((_k: any, _s: any, cb: any) => cb(null, undefined)),
    set: vi.fn((_k: any, _v: any, _s: any, cb: any) => cb(null)),
    keys: vi.fn((_s: any, cb: any) => cb(null, [])),
    flow: {
      get: vi.fn((_k: any, _s: any, cb: any) => cb(null, undefined)),
      set: vi.fn((_k: any, _v: any, _s: any, cb: any) => cb(null)),
      keys: vi.fn((_s: any, cb: any) => cb(null, [])),
    },
    global: {
      get: vi.fn((_k: any, _s: any, cb: any) => cb(null, undefined)),
      set: vi.fn((_k: any, _v: any, _s: any, cb: any) => cb(null)),
      keys: vi.fn((_s: any, cb: any) => cb(null, [])),
    },
  };

  return {
    id: "node-1",
    name: "test-node",
    z: "flow-1",
    x: 100,
    y: 200,
    g: "group-1",
    wires: [["node-2"]],
    credentials: {},
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
    updateWires: vi.fn(),
    receive: vi.fn(),
    context: vi.fn(() => contextStore),
    ...overrides,
  } as any;
}
