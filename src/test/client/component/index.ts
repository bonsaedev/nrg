import "../globals";
import { vi } from "vitest";
import type { MockRED } from "../mocks";

export type { MockRED, MockEditor } from "../mocks";
export { createRED, createJQuery } from "../mocks";
export { useFormNode } from "../../../core/client/use-form-node";

export interface TestNode {
  id: string;
  type: string;
  changed: boolean;
  _def: Record<string, any>;
  _: (key: string) => string;
  [key: string]: any;
}

interface FormProvide {
  __nrg_form_node: TestNode;
  __nrg_form_schema: Record<string, any>;
  __nrg_form_errors: Record<string, string>;
}

interface CreateNodeResult {
  node: TestNode;
  RED: MockRED;
  provide: FormProvide;
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
  const provide: FormProvide = {
    __nrg_form_node: node,
    __nrg_form_schema: {},
    __nrg_form_errors: {},
  };
  return { node, RED, provide };
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

function getMockRED(): MockRED {
  return window.RED;
}
