import type { JsonSchemaObject } from "@/core/client/types";
import type { MockRED } from "../mocks";

export { useFormNode } from "@/core/client/form/composables/use-form-node";

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
  /**
   * The node's registered `type`. When set, createNode resolves each schema not
   * passed explicitly (configSchema/credentialsSchema) from the map serialized
   * by the `schemas` globalSetup — so the test validates against the production
   * schema without importing it. Used only for schema lookup; the harness keeps
   * its own unique internal node type. Note: this is a reserved options key — a
   * raw-shorthand config object that itself carries a `type` field must be
   * passed via the explicit `{ configs }` form.
   */
  type?: string;
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
