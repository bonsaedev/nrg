import type { Component } from "vue";
import { validateNode, composeValidationSchema } from "./validation";
import { mountApp, unmountApp } from "./form";
import { getNodeState, getChanges, applyState } from "./state";
import {
  resolveI18n,
  createDefaultLabel,
  createDefaultPaletteLabel,
  createDefaultInputLabels,
  createDefaultOutputLabels,
} from "./labels";
import type {
  NodeRedNode,
  NodeFormDefinition,
  NodeDefinition,
  RuntimeNodeDefinition,
  NodeFeatures,
  NodeDefaults,
} from "./types";

const _schemas: Record<string, any> = {};
const _forms: Record<string, Component> = {};

function __setSchemas(schemas: Record<string, any>): void {
  Object.assign(_schemas, schemas);
}

function __setForms(forms: Record<string, Component>): void {
  Object.assign(_forms, forms);
}

function defineNode<T extends NodeDefinition>(options: T): T {
  return options;
}

function updateConfigNodeUsers(node: NodeRedNode): void {
  Object.keys(node._def.defaults ?? {}).forEach((prop) => {
    if (!node._def.defaults?.[prop]?.type) return;
    const oldConfigNodeId: string = node[prop] as string;
    const newConfigNodeId: string = node._newState![prop] as string;
    if (oldConfigNodeId === newConfigNodeId) return;
    const oldConfigNode = RED.nodes.node(oldConfigNodeId);
    if (oldConfigNode && oldConfigNode._def.category === "config") {
      const idx = oldConfigNode.users.findIndex(
        (_node) => _node.id === node.id,
      );
      if (idx !== -1) {
        oldConfigNode.users.splice(idx, 1);
      }
    }
  });

  Object.keys(node._def.defaults ?? {}).forEach((prop) => {
    if (!node._def.defaults?.[prop]?.type) return;
    const newConfigNodeId: string = node._newState![prop] as string;
    if (!newConfigNodeId) return;
    const newConfigNode = RED.nodes.node(newConfigNodeId);
    if (newConfigNode && newConfigNode._def.category === "config") {
      const idx = newConfigNode.users.findIndex(
        (_node) => _node.id === node.id,
      );
      if (idx === -1) {
        newConfigNode.users.push(node);
      }
    }
  });
}

function syncConfigInputs(
  node: NodeRedNode,
  newState: Record<string, any>,
  appContainerId: string,
): void {
  Object.keys(node._def.defaults ?? {}).forEach((prop) => {
    if (node._def.defaults[prop].type) return;
    const inputId = `node-config-input-${prop}`;
    let input = $(`#${inputId}`);
    if (!input.length) {
      input = $("<input>", { type: "hidden", id: inputId });
      $(`#${appContainerId}`).append(input);
    }
    input.val(newState[prop] ?? "");
  });
}

function computeBuiltinPortOutputs(
  defaults: NodeDefaults,
  baseOutputs: number,
): { hasBuiltinPorts: boolean; baseOutputs: number } {
  const hasBuiltinPorts =
    "errorPort" in defaults ||
    "completePort" in defaults ||
    "statusPort" in defaults;

  if (hasBuiltinPorts && !("outputs" in defaults)) {
    let initialOutputs = baseOutputs;
    if (defaults.errorPort?.value) initialOutputs++;
    if (defaults.completePort?.value) initialOutputs++;
    if (defaults.statusPort?.value) initialOutputs++;
    defaults.outputs = { value: initialOutputs };
  }

  return { hasBuiltinPorts, baseOutputs };
}

/**
 * Resolves the base output ports (excluding built-in error/complete/status) the
 * context-mode rows configure. Labels follow the same precedence as the canvas
 * port labels (`createDefaultOutputLabels`): named-port schemas label each port
 * by its name (resolved server-side in `outputPortNames`); otherwise the node's
 * `<type>.outputLabels.<index>` i18n catalog entry is used (so a single/positional
 * schema with locale labels matches the canvas hover label); failing both, fall
 * back to `Output {index}`.
 */
function computeOutputPorts(
  node: NodeRedNode,
  type: string,
  outputPortNames: string[] | undefined,
  baseOutputs: number,
): { index: number; label: string }[] {
  const names = outputPortNames ?? [];
  const ports: { index: number; label: string }[] = [];
  for (let i = 0; i < baseOutputs; i++) {
    const label =
      names[i] ??
      resolveI18n(node, `${type}.outputLabels.${i}`, `${type}.outputLabels`) ??
      `Output ${i}`;
    ports.push({ index: i, label });
  }
  return ports;
}

async function registerType(definition: NodeDefinition): Promise<void> {
  const { type } = definition;
  try {
    const nodeDefinition: RuntimeNodeDefinition = {
      ...(_schemas[type] ?? {}),
      ...definition,
    };

    const defaults = nodeDefinition.defaults
      ? { ...nodeDefinition.defaults }
      : undefined;
    const credentials = nodeDefinition.credentials ?? undefined;

    const appContainerId = `nrg-app-${type}`;

    $("<script>", {
      type: "text/html",
      "data-template-name": type,
      html: `<div id="${appContainerId}"></div>`,
    }).appendTo("body");

    const validationSchema = composeValidationSchema(
      nodeDefinition.configSchema,
      nodeDefinition.credentialsSchema,
    );

    let hasBuiltinPorts = false;
    let baseOutputs = nodeDefinition.outputs || 0;
    if (defaults) {
      ({ hasBuiltinPorts, baseOutputs } = computeBuiltinPortOutputs(
        defaults,
        baseOutputs,
      ));
    }
    if (validationSchema && defaults) {
      const firstProp = Object.keys(defaults)[0];
      if (firstProp) {
        const { required: _required, ...rest } = defaults[firstProp];
        defaults[firstProp] = {
          ...rest,
          validate: function (this: NodeRedNode, _value: any, _opt: any) {
            return validateNode(this, validationSchema);
          },
        };
      }
    }

    function oneditprepare(this: NodeRedNode) {
      const form: NodeFormDefinition | undefined =
        definition.form ??
        (_forms[type] ? { component: _forms[type] } : undefined);
      // Resolve output-port labels here (not at registration) so the node's i18n
      // catalog is available via `this._` for the `<type>.outputLabels.<index>`
      // fallback, matching the canvas port labels.
      const outputPorts = computeOutputPorts(
        this,
        type,
        nodeDefinition.outputPortNames,
        baseOutputs,
      );
      const features: NodeFeatures = {
        hasInputSchema: !!nodeDefinition.inputSchema,
        hasOutputSchema: !!nodeDefinition.outputsSchema,
        outputPorts,
      };
      mountApp(this, form, validationSchema, features, appContainerId);
    }

    function oneditsave(this: NodeRedNode) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const node = this;
      unmountApp(node);

      const newState = getNodeState(node._newState!);
      const oldState = getNodeState(node);
      const changes = getChanges(oldState, newState);
      const changed = !!Object.keys(changes)?.length;
      if (!changed) return false;

      updateConfigNodeUsers(node);
      applyState(node, newState);

      if (definition.category === "config") {
        syncConfigInputs(node, newState, appContainerId);
        return undefined;
      }

      return {
        changed,
        history: [
          {
            t: "edit",
            node,
            changes,
            links: [],
            dirty: RED.nodes.dirty(),
            changed,
          },
        ],
      };
    }

    function oneditcancel(this: NodeRedNode) {
      unmountApp(this);
    }

    function oneditdelete(this: NodeRedNode) {
      unmountApp(this);
    }

    RED.nodes.registerType(type, {
      type,
      defaults,
      credentials,
      category: nodeDefinition.category,
      color: nodeDefinition.color || "#FFFFFF",
      icon: nodeDefinition.icon,
      inputs: nodeDefinition.inputs || 0,
      outputs: nodeDefinition.outputs || 0,
      label: nodeDefinition.label || createDefaultLabel(type),
      paletteLabel:
        nodeDefinition.paletteLabel || createDefaultPaletteLabel(type),
      labelStyle: nodeDefinition.labelStyle,
      inputLabels: nodeDefinition.inputLabels || createDefaultInputLabels(type),
      outputLabels:
        nodeDefinition.outputLabels ||
        createDefaultOutputLabels(
          type,
          nodeDefinition.outputPortNames,
          hasBuiltinPorts,
          baseOutputs,
        ),
      align: nodeDefinition.align || "left",
      button: nodeDefinition.button
        ? { ...nodeDefinition.button, onclick: nodeDefinition.button.onClick }
        : undefined,
      oneditprepare,
      oneditsave,
      oneditcancel,
      oneditdelete,
      oneditresize: nodeDefinition.onEditResize,
      onpaletteadd: nodeDefinition.onPaletteAdd,
      onpaletteremove: nodeDefinition.onPaletteRemove,
    });
  } catch (error) {
    console.error(`Error while registering node type ${type}:`, error);
    throw error;
  }
}

async function registerTypes(nodes: NodeDefinition[]): Promise<void> {
  try {
    await Promise.all(nodes.map((definition) => registerType(definition)));
  } catch (error) {
    console.error("Error registering node types:", error);
    throw error;
  }
}

export { __setSchemas, __setForms, defineNode, registerType, registerTypes };
