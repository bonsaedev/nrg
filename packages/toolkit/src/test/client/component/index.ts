import "../globals";
import { vi } from "vitest";
import { reactive, watch } from "vue";
import {
  validateForm,
  composeValidationSchema,
} from "@bonsae/nrg-runtime/internal/client";
import type { MockRED } from "../mocks";
import type {
  TestNode,
  FormProvide,
  CreateNodeResult,
  CreateNodeOptions,
} from "./types";

export { useFormNode } from "@bonsae/nrg-runtime/internal/client";
// ./types is the single source of truth for the harness types (it's also the
// published declaration entry for this subpath); re-export them here so the
// runtime entry keeps the same public surface.
export type { TestNode, FormProvide, CreateNodeResult, CreateNodeOptions };

let counter = 0;

export function createNode(
  options: CreateNodeOptions | Record<string, any> = {},
): CreateNodeResult {
  const opts: CreateNodeOptions =
    "configs" in options ||
    "configSchema" in options ||
    "credentialsSchema" in options ||
    "nodes" in options
      ? (options as CreateNodeOptions)
      : { configs: options };

  const node: TestNode = reactive({
    id: `test-${counter}`,
    // Unique type per node: validateForm caches compiled schemas by
    // `node-schema-${subject.type}`, so a shared type would silently reuse
    // the first schema for every later createNode call in the same file.
    type: `test-node-${counter++}`,
    changed: false,
    _def: { outputs: 1 },
    _: (key: string) => key,
    ...opts.configs,
    credentials: { ...opts.credentials },
  });

  // Shallow-copy and strip $id: the validator caches compiled schemas by
  // $id, and real TypeBox schemas ship one — without stripping it, the first
  // composition in a file would be reused for every later createNode call
  // (masking e.g. a credentialsSchema added in a later test). The validator
  // also stamps $id onto what it compiles, so never hand it the caller's
  // imported schema object.
  const composed = composeValidationSchema(
    opts.configSchema,
    opts.credentialsSchema,
  ) as Record<string, any> | undefined;
  let validationSchema: Record<string, any> | undefined;
  if (composed) {
    const { $id: _ignored, ...rest } = composed;
    validationSchema = rest;
  }

  const RED = getMockRED();
  spyOnRED(RED);

  // Always reset the registry so fake nodes from a previous createNode call
  // in the same file don't leak into this one. The fakes are resolvable via
  // RED.nodes.node(id) and listed by eachConfig/eachNode/filterNodes.
  RED.nodes.clear();
  for (const fake of opts.nodes ?? []) {
    RED.nodes.add(fake);
  }

  const errors: Record<string, string> = reactive(
    validationSchema ? validateForm(node, validationSchema) : {},
  );

  if (validationSchema) {
    watch(
      node,
      () => {
        const newErrors = validateForm(node, validationSchema);
        Object.keys(errors).forEach((k) => delete errors[k]);
        Object.assign(errors, newErrors);
      },
      { deep: true },
    );
  }

  const provide: FormProvide = {
    __nrg_form_node: node,
    __nrg_form_schema: validationSchema ?? {},
    __nrg_form_errors: errors,
  };

  return { node, errors, RED, provide };
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
  spyIfNeeded(RED.popover, "create");
  spyIfNeeded(RED.nodes, "registerType");
  spyIfNeeded(RED.nodes, "node");
  spyIfNeeded(RED.nodes, "add");
  spyIfNeeded(RED.nodes, "remove");
  spyIfNeeded(RED.nodes, "getType");
  spyIfNeeded(RED.nodes, "dirty");
  spyIfNeeded(RED.events, "on");
  spyIfNeeded(RED.events, "off");
  spyIfNeeded(RED.events, "emit");
  spyIfNeeded(RED.comms, "subscribe");
  spyIfNeeded(RED.comms, "unsubscribe");
}

function getMockRED(): MockRED {
  return window.RED;
}
