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
import NodeRedInputLabel from "./components/node-red-input-label.vue";
import NodeRedToggle from "./components/node-red-toggle.vue";
import NodeRedJsonSchemaForm from "./components/node-red-json-schema-form.vue";
import type { NodeRedNode, NodeFormDefinition, NodeFeatures } from "../types";

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
  node._newState = cloneDeep(node);
  node._app = createNodeRedVueApp(node._newState, form, schema, features);
  node._app.mount(`#${containerId}`);
}

export function unmountApp(node: NodeRedNode) {
  if (node._app) {
    node._app.unmount();
    node._app = null;
  }
}
