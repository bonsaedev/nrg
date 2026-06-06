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

export function createNode(overrides: Record<string, any> = {}): TestNode {
  return {
    id: "node-1",
    type: "test-node",
    changed: false,
    _def: { outputs: 1 },
    _: (key: string) => key,
    ...overrides,
  };
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
}

export function getMockRED(): MockRED {
  return (window as any).RED;
}

export const i18nMock = {
  global: {
    mocks: {
      $i18n: (key: string) => key,
    },
  },
};
