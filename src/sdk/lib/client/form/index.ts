import type { App } from "vue";
import { createApp } from "vue";
import { cloneDeep } from "es-toolkit";
import type { JSONSchemaType } from "ajv";
import NodeRedVueApp from "./app.vue";
import NodeRedInput from "./components/node-red-input.vue";
import NodeRedTypedInput from "./components/node-red-typed-input.vue";
import NodeRedConfigInput from "./components/node-red-config-input.vue";
import NodeRedSelectInput from "./components/node-red-select-input.vue";
import NodeRedEditorInput from "./components/node-red-editor-input.vue";
import NodeRedTray from "./components/node-red-tray.vue";
import NodeRedInputLabel from "./components/node-red-input-label.vue";
import NodeRedToggle from "./components/node-red-toggle.vue";
import NodeRedJsonSchemaForm from "./components/node-red-json-schema-form.vue";
import type { NodeFormDefinition, NodeFeatures, NodeRedNode } from "../types";

function createNodeRedVueApp(
  node: NodeRedNode,
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
  app.component("NodeRedTray", NodeRedTray);
  app.component("NodeRedJsonSchemaForm", NodeRedJsonSchemaForm);
  app.component("NodeRedNodeForm", form?.component ?? NodeRedJsonSchemaForm);

  app.config.globalProperties.$i18n = (label: string) =>
    node._(`${node.type}.${label}`);
  return app;
}

export function mountApp(
  node: NodeRedNode,
  form: NodeFormDefinition | undefined,
  schema: any,
  features: NodeFeatures,
  containerId: string,
) {
  $(`#${containerId}`).empty();
  // Clone real node state only — exclude a prior working copy (`_newState`) and
  // the mounted Vue app (`_app`). Both are own-enumerable props, so cloning the
  // raw `node` would nest the previous `_newState` one level deeper on every
  // re-open (O(N) retained memory + clone cost across an editor session).
  const { _newState: _prevState, _app: _prevApp, ...state } = node as any;
  const working = cloneDeep(state) as NodeRedNode;
  node._newState = working;
  node._app = createNodeRedVueApp(working, form, schema, features);
  node._app.mount(`#${containerId}`);
}

export function unmountApp(node: NodeRedNode) {
  if (node._app) {
    node._app.unmount();
    node._app = null;
  }
}
