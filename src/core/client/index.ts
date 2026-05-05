import type { Component, App } from "vue";
import { createApp } from "vue";
import { cloneDeep, isEqual } from "es-toolkit";
import { validateNode } from "./validation";
import type { JSONSchemaType } from "ajv";
import NodeRedVueApp from "./app.vue";
import NodeRedInput from "./components/node-red-input.vue";
import NodeRedTypedInput from "./components/node-red-typed-input.vue";
import NodeRedConfigInput from "./components/node-red-config-input.vue";
import NodeRedSelectInput from "./components/node-red-select-input.vue";
import NodeRedEditorInput from "./components/node-red-editor-input.vue";
import NodeRedInputLabel from "./components/node-red-input-label.vue";
import NodeRedToggle from "./components/node-red-toggle.vue";
import NodeRedJsonSchemaForm from "./components/node-red-json-schema-form.vue";

const _schemas: Record<string, any> = {};
const _forms: Record<string, Component> = {};

function __setSchemas(schemas: Record<string, any>): void {
  Object.assign(_schemas, schemas);
}

function __setForms(forms: Record<string, Component>): void {
  Object.assign(_forms, forms);
}

interface NodeStateCredentials {
  [key: string]: any;
}

interface NodeState {
  credentials: NodeStateCredentials;
  [key: string]: any;
}

interface Node {
  id: string;
  type: string;
  name: string;
  category: string;
  x: string;
  y: string;
  g: string;
  z: string;
  credentials: Record<string, any>;
  _def: {
    defaults: Record<
      string,
      { value: string; type?: string; label?: string; required?: boolean }
    >;
    credentials: Record<
      string,
      {
        value: string;
        type?: "password" | "text";
        label?: string;
        required?: boolean;
      }
    >;
    category: string;
    color?: string;
    icon?: string;
    label?: ((this: Node) => string) | string;
    inputs?: number;
    outputs?: number;
    paletteLabel?: ((this: Node) => string) | string;
    labelStyle?: ((this: Node) => string) | string;
    inputLabels?: ((this: Node, index: number) => string) | string;
    outputLabels?: ((this: Node, index: number) => string) | string;
    align?: "left" | "right";
    button?: NodeButtonDefinition;
    onPaletteAdd?: (this: Node) => void;
    onPaletteRemove?: (this: Node) => void;
    form: NodeFormDefinition;
  };
  _newState?: Node;
  _app?: App | null;
  _: (str: string) => string;
  [key: string]: any;
}

/**
 * Interface representing the button configuration for a Node.
 *
 * @interface NodeButtonDefinition
 * @property {string} toggle - Text to display when toggling the button.
 * @property {function(): void} onclick - Function to execute when the button is clicked.
 * @property {function(): boolean} [enabled] - Function that determines whether the button should be
 *   enabled. Returns true if the button should be enabled, false otherwise.
 * @property {function(): boolean} [visible] - Function that determines whether the button should be
 *   visible. Returns true if the button should be visible, false otherwise.
 */
interface NodeButtonDefinition {
  toggle: string;
  onclick: () => void;
  enabled?: () => boolean;
  visible?: () => boolean;
}

/**
 * Interface representing the form configuration for a Node.
 *
 * @interface NodeFormDefinition
 * @property {Component} [component] - Vue 3 component.
 */
interface NodeFormDefinition {
  component?: Component;
}

/**
 * Interface representing the Node options used during registration
 *
 * @type NodeDefinition
 * @property {string} type - The unique identifier for this node type.
 * @property {string} category - The category this node belongs to in the palette.
 * @property {string} [color] - The color associated with this node, in hex format.
 * @property {string} [icon] - The icon to display for this node.
 * @property {(function(): string)|string} [label] - The label to display on the node. Can be a static string or a function returning a string.
 * @property {number} [inputs] - Number of input ports the node should have.
 * @property {number} [outputs] - Number of output ports the node should have.
 * @property {(function(): string)|string} [paletteLabel] - The label to show in the palette. Can be a static string or a function returning a string.
 * @property {(function(): string)|string} [labelStyle] - CSS style to apply to the node label. Can be a static string or a function returning a string.
 * @property {(function(): string)|string} [inputLabels] - Labels for the input ports. Can be a static string or a function returning a string.
 * @property {(function(): string)|string} [outputLabels] - Labels for the output ports. Can be a static string or a function returning a string.
 * @property {"left"|"right"} [align] - Alignment of the node content.
 * @property {NodeButtonDefinition} [button] - Configuration for a button on the node.
 * @property {function(): void} [onPaletteAdd] - Function called when the node is added to the palette.
 * @property {function(): void} [onPaletteRemove] - Function called when the node is removed from the palette.
 * @property {NodeFormDefinition} form - The form component to use for configuring the node.
 * @property {JSONSchemaType} [schema] - Schema definition for validation.
 */
interface NodeDefinition {
  type: string;
  category?: string;
  color?: string;
  icon?: ((this: Node) => string) | string;
  label?: ((this: Node) => string) | string;
  inputs?: number;
  outputs?: number;
  paletteLabel?: ((this: Node) => string) | string;
  labelStyle?: ((this: Node) => string) | string;
  inputLabels?: ((this: Node, index: number) => string) | string;
  outputLabels?: ((this: Node, index: number) => string) | string;
  align?: "left" | "right";
  button?: NodeButtonDefinition;
  onEditResize?: (this: Node, size: { width: number; height: number }) => void;
  onPaletteAdd?: (this: Node) => void;
  onPaletteRemove?: (this: Node) => void;
  form?: NodeFormDefinition;
}

interface NodeFeatures {
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
}

function createNodeRedVueApp(
  node: Node,
  form: NodeFormDefinition | undefined,
  schema: JSONSchemaType<any>,
  features: NodeFeatures,
): App<Element> {
  const app = createApp(NodeRedVueApp, {
    node,
    schema,
    features,
  });

  app.component("NodeRedInputLabel", NodeRedInputLabel);
  app.component("NodeRedToggle", NodeRedToggle);
  app.component("NodeRedInput", NodeRedInput);
  app.component("NodeRedTypedInput", NodeRedTypedInput);
  app.component("NodeRedConfigInput", NodeRedConfigInput);
  app.component("NodeRedSelectInput", NodeRedSelectInput);
  app.component("NodeRedEditorInput", NodeRedEditorInput);
  app.component("NodeRedJsonSchemaForm", NodeRedJsonSchemaForm);
  app.component("NodeRedNodeForm", form?.component ?? NodeRedJsonSchemaForm);

  // NOTE: now every form can use $i18n to access Node-RED built in i18n features
  app.config.globalProperties.$i18n = (label: string) =>
    node._(`${node.type}.${label}`);
  return app;
}

function mountApp(
  node: Node,
  form: NodeFormDefinition | undefined,
  schema: JSONSchemaType<any>,
  features: NodeFeatures,
  containerId: string,
) {
  $(`#${containerId}`).empty();
  node._newState = cloneDeep(node);
  node._app = createNodeRedVueApp(node._newState, form, schema, features);
  node._app.mount(`#${containerId}`);
}

function unmountApp(node: Node) {
  if (node._app) {
    node._app.unmount();
    node._app = null;
  }
}

function getNodeState(node: Node): NodeState {
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

// Deep-merge source into target, but replace arrays wholesale instead of
// merging them element-by-element (es-toolkit merge keeps old array items
// when the source is shorter, e.g. going from ["a","b"] to [] keeps ["a","b"]).
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

/**
 * Prepares a node registration function using the provided base configuration.
 *
 * This is a higher-order function that returns a function which can be used
 * to register the node with a specific type at runtime.
 *
 * @param {Object} options - The static configuration shared by all nodes of this kind
 * @param {string} [options.category="undefined"] - The category this node belongs to in the palette
 * @param {string} [options.color="#FFFFFF"] - The color associated with this node, in hex format
 * @param {string} [options.icon] - The icon to display for this node
 * @param {(function(): string)|string} [options.label] - The label to display on the node
 * @param {number} [options.inputs=0] - Number of input ports the node should have
 * @param {number} [options.outputs=0] - Number of output ports the node should have
 * @param {(function(): string)|string} [options.paletteLabel] - The label to show in the palette
 * @param {(function(): string)|string} [options.labelStyle] - CSS style to apply to the node label
 * @param {(function(): string)|string} [options.inputLabels] - Labels for the input ports
 * @param {(function(): string)|string} [options.outputLabels] - Labels for the output ports
 * @param {"left"|"right"} [options.align="left"] - Alignment of the node content
 * @param {NodeButtonDefinition} [options.button] - Configuration for a button on the node
 * @param {function(): void} [options.onPaletteAdd] - Function called when the node is added to the palette
 * @param {function(): void} [options.onPaletteRemove] - Function called when the node is removed from the palette
 * @param {Component} options.form - The form component to use for configuring the node
 * @param {JSONSchemaType} [options.schema] - Schema definition for validation
 *
 * @returns A function that registers the node with the specified type
 */
async function registerType(definition: NodeDefinition): Promise<void> {
  const { type } = definition;
  try {
    const nodeDefinition = {
      ...(_schemas[type] ?? {}),
      ...definition,
    };

    // defaults and credentials are pre-computed at build time by the inliner
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

    // Wire schema validation into Node-RED's own validation system.
    // Node-RED calls defaults[prop].validate during its validateNode() cycle
    // (on import, save, undo, deploy). Returning false marks the node invalid
    // and shows the red error triangle on the workspace.
    if (validationSchema && defaults) {
      const firstProp = Object.keys(defaults)[0];
      if (firstProp) {
        defaults[firstProp] = {
          ...defaults[firstProp],
          // 2-arg signature (value, opt) tells Node-RED 3.x to accept
          // string/array returns as error messages for the tooltip.
          validate: function (this: Node, _value: any, _opt: any) {
            return validateNode(this, validationSchema);
          },
        };
      }
    }

    function oneditprepare(this: Node) {
      const form =
        definition.form ??
        (_forms[type] ? { component: _forms[type] } : undefined);
      const features: NodeFeatures = {
        hasInputSchema: !!nodeDefinition.inputSchema,
        hasOutputSchema: !!nodeDefinition.outputsSchema,
      };
      mountApp(this, form, validationSchema, features, appContainerId);
    }

    function oneditsave(this: Node) {
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

      // For config nodes, populate the standard Node-RED input elements so
      // pane.apply() can read the new values after oneditsave returns.
      // Regular nodes must NOT have hidden inputs created here: pane.apply()
      // reads them back via input.val() which coerces arrays/objects to strings,
      // overwriting the correctly-typed values already set by merge() above.
      const isConfigNode = definition.category === "config";
      if (isConfigNode) {
        Object.keys(node._def.defaults ?? {}).forEach((prop) => {
          if (node._def.defaults[prop].type) return; // config-node refs handled separately
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

    function oneditcancel(this: Node) {
      unmountApp(this);
    }

    function oneditdelete(this: Node) {
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
        function (this: Node) {
          if (this.name) return this.name;
          const label = this._(`${type}.label`);
          if (label && label !== `${type}.label`) return label;
          return type;
        },
      paletteLabel:
        nodeDefinition.paletteLabel ||
        function (this: Node) {
          const palette = this._(`${type}.paletteLabel`);
          if (palette && palette !== `${type}.paletteLabel`) return palette;
          const label = this._(`${type}.label`);
          if (label && label !== `${type}.label`) return label;
          return type;
        },
      labelStyle: nodeDefinition.labelStyle,
      inputLabels:
        nodeDefinition.inputLabels ||
        function (this: Node, index: number) {
          // Try indexed label first (inputLabels[0], inputLabels[1], ...)
          const indexed = this._(`${type}.inputLabels.${index}`);
          if (indexed && indexed !== `${type}.inputLabels.${index}`)
            return indexed;
          // Try single string label
          const single = this._(`${type}.inputLabels`);
          if (single && single !== `${type}.inputLabels`) return single;
          return undefined;
        },
      outputLabels:
        nodeDefinition.outputLabels ||
        function (this: Node, index: number) {
          const indexed = this._(`${type}.outputLabels.${index}`);
          if (indexed && indexed !== `${type}.outputLabels.${index}`)
            return indexed;
          const single = this._(`${type}.outputLabels`);
          if (single && single !== `${type}.outputLabels`) return single;
          return undefined;
        },
      align: nodeDefinition.align || "left",
      button: nodeDefinition.button,
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

/**
 * Registers multiple nodes with Node-RED in parallel.
 *
 * @param {Array<[string, NodeDefinition]>} nodes - Array of tuples containing node type and definition
 * @returns Resolves when all nodes are registered
 *
 * @example
 * await registerTypes([
 *   ["remote-server", remoteServer],
 *   ["your-node", yourNode],
 * ]);
 */
async function registerTypes(nodes: NodeDefinition[]): Promise<void> {
  try {
    await Promise.all(nodes.map((definition) => registerType(definition)));
  } catch (error) {
    console.error("Error registering node types:", error);
    throw error;
  }
}

export {
  __setSchemas,
  __setForms,
  defineNode,
  registerType,
  registerTypes,
  NodeDefinition,
  NodeButtonDefinition,
  NodeFormDefinition,
  Node,
};
