import type { Component } from "vue";
import { isEqual } from "es-toolkit";
import { validateNode } from "./validation";
import { mountApp, unmountApp } from "./form";
import type {
  NodeRedNode,
  NodeState,
  NodeButtonDefinition,
  NodeFormDefinition,
  NodeDefinition,
  NodeFeatures,
} from "./types";

const _schemas: Record<string, any> = {};
const _forms: Record<string, Component> = {};

function __setSchemas(schemas: Record<string, any>): void {
  Object.assign(_schemas, schemas);
}

function __setForms(forms: Record<string, Component>): void {
  Object.assign(_forms, forms);
}

function getNodeState(node: NodeRedNode): NodeState {
  const state: NodeState = {
    credentials: {},
  };
  Object.keys(node._def.defaults ?? {}).forEach((prop) => {
    state[prop] = node[prop];
  });
  if (node._def.credentials) {
    Object.keys(node._def.credentials).forEach((prop) => {
      state.credentials[prop] = node.credentials?.[prop];

      if (node._def.credentials[prop].type === "password") {
        state.credentials[`has_${prop}`] =
          node.credentials?.[`has_${prop}`] || false;
      }
    });
  }

  return state;
}

function getChanges(
  o: Record<any, any>,
  n: Record<any, any>,
): Record<string, any> {
  const changes: Record<string, any> = {};

  const allKeys = new Set([...Object.keys(o), ...Object.keys(n ?? {})]);
  allKeys.forEach((prop) => {
    const _o = o[prop];
    const _n = (n ?? {})[prop];

    if (!Array.isArray(_o) && typeof _o === "object" && _o !== null) {
      const _changes = getChanges(_o, _n);
      if (Object.keys(_changes).length) {
        changes[prop] = _changes;
      }
    } else if (!isEqual(_o, _n)) {
      changes[prop] = _o;
    }
  });

  return changes;
}

function applyState(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (Array.isArray(srcVal)) {
      target[key] = [...srcVal];
    } else if (srcVal !== null && typeof srcVal === "object") {
      if (
        !target[key] ||
        typeof target[key] !== "object" ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }
      applyState(target[key], srcVal);
    } else {
      target[key] = srcVal;
    }
  }
}

function defineNode<T extends NodeDefinition>(options: T): T {
  return options;
}

async function registerType(definition: NodeDefinition): Promise<void> {
  const { type } = definition;
  try {
    const nodeDefinition = {
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

    const validationSchema =
      nodeDefinition.configSchema &&
      nodeDefinition.credentialsSchema?.properties
        ? {
            ...nodeDefinition.configSchema,
            properties: {
              ...nodeDefinition.configSchema.properties,
              credentials: {
                type: "object",
                properties: nodeDefinition.credentialsSchema.properties,
              },
            },
          }
        : nodeDefinition.configSchema;

    const hasEmitPorts =
      defaults &&
      ("emitError" in defaults ||
        "emitComplete" in defaults ||
        "emitStatus" in defaults);
    const baseOutputs = nodeDefinition.outputs || 0;
    if (hasEmitPorts && defaults && !("outputs" in defaults)) {
      let initialOutputs = baseOutputs;
      if (defaults.emitError?.value) initialOutputs++;
      if (defaults.emitComplete?.value) initialOutputs++;
      if (defaults.emitStatus?.value) initialOutputs++;
      defaults.outputs = { value: initialOutputs };
    }

    if (validationSchema && defaults) {
      const firstProp = Object.keys(defaults)[0];
      if (firstProp) {
        defaults[firstProp] = {
          ...defaults[firstProp],
          validate: function (this: NodeRedNode, _value: any, _opt: any) {
            return validateNode(this, validationSchema);
          },
        };
      }
    }

    function oneditprepare(this: NodeRedNode) {
      const form =
        definition.form ??
        (_forms[type] ? { component: _forms[type] } : undefined);
      const features: NodeFeatures = {
        hasInputSchema: !!nodeDefinition.inputSchema,
        hasOutputSchema: !!nodeDefinition.outputsSchema,
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

      applyState(node, newState);

      const isConfigNode = definition.category === "config";
      if (isConfigNode) {
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
      label:
        nodeDefinition.label ||
        function (this: NodeRedNode) {
          if (this.name) return this.name;
          const label = this._(`${type}.label`);
          if (label && label !== `${type}.label`) return label;
          return type;
        },
      paletteLabel:
        nodeDefinition.paletteLabel ||
        function (this: NodeRedNode) {
          const palette = this._(`${type}.paletteLabel`);
          if (palette && palette !== `${type}.paletteLabel`) return palette;
          const label = this._(`${type}.label`);
          if (label && label !== `${type}.label`) return label;
          return type;
        },
      labelStyle: nodeDefinition.labelStyle,
      inputLabels:
        nodeDefinition.inputLabels ||
        function (this: NodeRedNode, index: number) {
          const indexed = this._(`${type}.inputLabels.${index}`);
          if (indexed && indexed !== `${type}.inputLabels.${index}`)
            return indexed;
          const single = this._(`${type}.inputLabels`);
          if (single && single !== `${type}.inputLabels`) return single;
          return undefined;
        },
      outputLabels:
        nodeDefinition.outputLabels ||
        function (this: NodeRedNode, index: number) {
          if (hasEmitPorts) {
            let extraIdx = baseOutputs;
            if (this.emitError) {
              if (index === extraIdx) return "Error";
              extraIdx++;
            }
            if (this.emitComplete) {
              if (index === extraIdx) return "Complete";
              extraIdx++;
            }
            if (this.emitStatus) {
              if (index === extraIdx) return "Status";
              extraIdx++;
            }
          }
          const indexed = this._(`${type}.outputLabels.${index}`);
          if (indexed && indexed !== `${type}.outputLabels.${index}`)
            return indexed;
          const single = this._(`${type}.outputLabels`);
          if (single && single !== `${type}.outputLabels`) return single;
          return undefined;
        },
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
