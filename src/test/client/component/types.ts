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

export declare function createNode(
  overrides?: Record<string, any>,
): CreateNodeResult;
