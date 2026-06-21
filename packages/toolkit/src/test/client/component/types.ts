import type { JsonSchemaObject } from "@bonsae/nrg-runtime/internal/client";
import type { MockRED } from "../mocks";

export { useFormNode } from "@bonsae/nrg-runtime/internal/client";

export type {
  MockRED,
  MockSettings,
  MockEditor,
  MockNotification,
  MockPopover,
  MockTooltip,
} from "../mocks";

export interface TestNode {
  id: string;
  type: string;
  changed: boolean;
  _def: Record<string, any>;
  _: (key: string) => string;
  credentials?: Record<string, any>;
  [key: string]: any;
}

export interface FormProvide {
  __nrg_form_node: TestNode;
  __nrg_form_schema: Record<string, any>;
  __nrg_form_errors: Record<string, string>;
}

export interface CreateNodeResult {
  node: TestNode;
  errors: Record<string, string>;
  RED: MockRED;
  provide: FormProvide;
}

export interface CreateNodeOptions {
  configs?: Record<string, any>;
  credentials?: Record<string, any>;
  configSchema?: JsonSchemaObject;
  credentialsSchema?: JsonSchemaObject;
  /** Fake config nodes resolvable via RED.nodes.node(id) — required for NodeRef field validation. */
  nodes?: Array<{ id: string; type: string } & Record<string, any>>;
}

export declare function createNode(
  options?: CreateNodeOptions | Record<string, any>,
): CreateNodeResult;
