import "../globals";
import { beforeEach } from "vitest";
import { config } from "vitest-browser-vue";
import { createRED, createJQuery, resetRED } from "../mocks";
import NodeRedInput from "../../../core/client/form/components/node-red-input.vue";
import NodeRedTypedInput from "../../../core/client/form/components/node-red-typed-input.vue";
import NodeRedConfigInput from "../../../core/client/form/components/node-red-config-input.vue";
import NodeRedSelectInput from "../../../core/client/form/components/node-red-select-input.vue";
import NodeRedEditorInput from "../../../core/client/form/components/node-red-editor-input.vue";
import NodeRedInputLabel from "../../../core/client/form/components/node-red-input-label.vue";
import NodeRedToggle from "../../../core/client/form/components/node-red-toggle.vue";
import NodeRedJsonSchemaForm from "../../../core/client/form/components/node-red-json-schema-form.vue";

config.global.mocks.$i18n = (key: string) => key;

// Register the built-in form components globally, mirroring production
// (createNodeRedVueApp in core/client/form/index.ts), so plugin component
// tests render the real inputs instead of unresolved custom elements.
config.global.components = {
  NodeRedInputLabel,
  NodeRedToggle,
  NodeRedInput,
  NodeRedTypedInput,
  NodeRedConfigInput,
  NodeRedSelectInput,
  NodeRedEditorInput,
  NodeRedJsonSchemaForm,
};

window.$ = createJQuery();
window.RED = createRED();

// Reset RED state per test (registries, listeners, subscriptions, settings)
// while keeping the same object — module-scope `const RED = window.RED`
// captures in test files stay valid.
beforeEach(() => {
  resetRED(window.RED);
});
