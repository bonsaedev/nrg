import { vi } from "vitest";

export const defaultConfig = {
  testTimeout: 30_000,
  setupFiles: ["@bonsae/nrg/test/client/unit/setup"],
  browser: {
    enabled: true,
    instances: [{ browser: "chromium" }],
  },
};

export interface TestNode {
  id: string;
  type: string;
  changed: boolean;
  _def: Record<string, any>;
  _: (key: string) => string;
  [key: string]: any;
}

interface CreateNodeResult {
  node: TestNode;
  RED: MockRED;
}

export function createNode(
  overrides: Record<string, any> = {},
): CreateNodeResult {
  const node: TestNode = {
    id: `test-${Math.random().toString(36).slice(2, 10)}`,
    type: "test-node",
    changed: false,
    _def: { outputs: 1 },
    _: (key: string) => key,
    ...overrides,
  };
  const RED = getMockRED();
  spyOnRED(RED);
  return { node, RED };
}

function spyIfNeeded(obj: any, method: string): void {
  if (!vi.isMockFunction(obj[method])) {
    vi.spyOn(obj, method);
  }
}

function spyOnRED(RED: MockRED): void {
  spyIfNeeded(RED, "_");
  spyIfNeeded(RED, "notify");
  spyIfNeeded(RED.editor, "createEditor");
  spyIfNeeded(RED.editor, "prepareConfigNodeSelect");
  spyIfNeeded(RED.editor, "validateNode");
  spyIfNeeded(RED.tray, "show");
  spyIfNeeded(RED.tray, "close");
  spyIfNeeded(RED.popover, "tooltip");
  spyIfNeeded(RED.nodes, "registerType");
  spyIfNeeded(RED.nodes, "node");
  spyIfNeeded(RED.nodes, "dirty");
  spyIfNeeded(RED.events, "on");
  spyIfNeeded(RED.events, "off");
  spyIfNeeded(RED.events, "emit");
}

export interface MockEditor {
  getValue(): string;
  setValue(val: string): void;
  getSession(): { on(event: string, cb: (...args: any[]) => any): void };
  focus(): void;
  destroy(): void;
  saveView(): void;
  restoreView(): void;
}

export interface MockRED {
  _(key: string): string;
  editor: {
    createEditor(options: any): MockEditor;
    prepareConfigNodeSelect(...args: any[]): void;
    validateNode(...args: any[]): boolean;
  };
  tray: {
    show(...args: any[]): void;
    close(): void;
  };
  popover: {
    tooltip(...args: any[]): {
      delete(): void;
      setAction(...args: any[]): void;
    };
  };
  nodes: {
    registerType(...args: any[]): void;
    node(...args: any[]): null;
    dirty(...args: any[]): boolean;
  };
  events: {
    on(...args: any[]): void;
    off(...args: any[]): void;
    emit(...args: any[]): void;
  };
  settings: Record<string, any>;
  notify(...args: any[]): void;
}

function getMockRED(): MockRED {
  return (window as any).RED;
}
