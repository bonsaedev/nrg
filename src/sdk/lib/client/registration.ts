import { defineNode } from "./define-node";
import {
  validateNode,
  composeValidationSchema,
  validateSchemaFields,
} from "./validation";
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
  NodeFormDefinition,
  NodeDefinition,
  RuntimeNodeDefinition,
  NodeFeatures,
  NodeDefaults,
  NodeRedNode,
} from "./types";

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
): { hasBuiltinPorts: boolean; baseOutputs: number; initialOutputs: number } {
  const hasBuiltinPorts =
    "errorPort" in defaults ||
    "completePort" in defaults ||
    "statusPort" in defaults;

  // The initial output-port count = base ports + every built-in lifecycle port
  // whose default is ON. This MUST drive both `defaults.outputs` (applied when a
  // node is dragged from the palette) AND the type's top-level `outputs` (used
  // when a node is imported/loaded WITHOUT an `outputs` field — Node-RED then
  // falls back to `_def.outputs` and TRIMS any wires beyond it). If the two
  // disagree, a default-on port (e.g. `completePort: true`) silently loses its
  // port and its wire on load.
  let initialOutputs = baseOutputs;
  if (defaults.errorPort?.value) initialOutputs++;
  if (defaults.completePort?.value) initialOutputs++;
  if (defaults.statusPort?.value) initialOutputs++;

  if (hasBuiltinPorts && !("outputs" in defaults)) {
    defaults.outputs = { value: initialOutputs };
  }

  return { hasBuiltinPorts, baseOutputs, initialOutputs };
}

/**
 * Resolves the base output ports (excluding built-in error/complete/status) the
 * Outputs rows configure. Labels follow the same precedence as the canvas
 * port labels (`createDefaultOutputLabels`): the port's `<type>.outputs.<name>.label`
 * catalog entry (named ports — the port name from the Output type is the lookup
 * KEY only, resolved server-side into `outputPortNames`), then the positional
 * `<type>.outputs.<index>.label`; failing both, fall back to `Output {index}`.
 */
function computeOutputPorts(
  node: NodeRedNode,
  type: string,
  outputPortNames: string[] | undefined,
  baseOutputs: number,
): { index: number; label: string; description: string }[] {
  const names = outputPortNames ?? [];
  const ports: { index: number; label: string; description: string }[] = [];
  for (let i = 0; i < baseOutputs; i++) {
    const name = names[i];
    const label =
      resolveI18n(
        node,
        ...(name ? [`${type}.outputs.${name}.label`] : []),
        `${type}.outputs.${i}.label`,
      ) ?? `Output ${i}`;
    // Same precedence as the label: the port's `outputs.<name>.description`
    // catalog entry, then positional `outputs.<index>.description`; else blank.
    const description =
      resolveI18n(
        node,
        ...(name ? [`${type}.outputs.${name}.description`] : []),
        `${type}.outputs.${i}.description`,
      ) ?? "";
    ports.push({ index: i, label, description });
  }
  return ports;
}

async function registerType(definition: NodeDefinition): Promise<void> {
  const { type } = definition;
  try {
    // The build bakes each node's server-extracted schema (defaults, configSchema,
    // credentialsSchema, outputPortNames, …) and its convention form onto the
    // definition object itself — the vite inliner wraps every `defineNode({type})`
    // call as `{ ...schema, [form,] ...defineNode({...}) }`, keyed by the literal
    // `type`. So the definition arriving here is already the merged
    // RuntimeNodeDefinition; there is no runtime schema/form registry to look up.
    const nodeDefinition = definition as RuntimeNodeDefinition;

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
    let initialOutputs = baseOutputs;
    if (defaults) {
      ({ hasBuiltinPorts, baseOutputs, initialOutputs } =
        computeBuiltinPortOutputs(defaults, baseOutputs));
    }
    if (validationSchema && defaults) {
      const firstProp = Object.keys(defaults)[0];
      if (firstProp) {
        const { required: _required, ...rest } = defaults[firstProp];
        defaults[firstProp] = {
          ...rest,
          validate: function (this: NodeRedNode, _value: any, _opt: any) {
            const base = validateNode(this, validationSchema);
            // Also fail on a malformed data-validation schema string so the
            // node's workspace error triangle fires (not just the form).
            const schemaErrors = validateSchemaFields(this);
            if (base === true && schemaErrors.length === 0) return true;
            return [...(base === true ? [] : base), ...schemaErrors];
          },
        };
      }
    }

    function oneditprepare(this: NodeRedNode) {
      // Form is already resolved on the definition (author-declared `form:` wins,
      // else the build folded in the convention `{componentsDir}/{type}.vue`).
      const form: NodeFormDefinition | undefined = nodeDefinition.form;
      // Resolve output-port labels here (not at registration) so the node's i18n
      // catalog is available via `this._` for the `<type>.outputs.<name>.label`
      // fallback, matching the canvas port labels.
      const outputPorts = computeOutputPorts(
        this,
        type,
        nodeDefinition.outputPortNames,
        baseOutputs,
      );
      const features: NodeFeatures = {
        hasInput: (nodeDefinition.inputs ?? 0) > 0,
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
      const changed = Object.keys(changes).length > 0;
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
      // Top-level `outputs` must equal the initial computed count (base + default-on
      // built-in ports), NOT just the base — Node-RED uses this when loading a node
      // with no explicit `outputs` field, and trims wires past it. (see
      // computeBuiltinPortOutputs)
      outputs: initialOutputs,
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

export { defineNode, registerType, registerTypes };
