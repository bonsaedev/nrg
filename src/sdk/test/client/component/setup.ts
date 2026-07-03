import { config } from "vitest-browser-vue";
import NodeRedInput from "@/sdk/lib/client/form/components/node-red-input.vue";
import NodeRedTypedInput from "@/sdk/lib/client/form/components/node-red-typed-input.vue";
import NodeRedConfigInput from "@/sdk/lib/client/form/components/node-red-config-input.vue";
import NodeRedSelectInput from "@/sdk/lib/client/form/components/node-red-select-input.vue";
import NodeRedEditorInput from "@/sdk/lib/client/form/components/node-red-editor-input.vue";
import NodeRedInputLabel from "@/sdk/lib/client/form/components/node-red-input-label.vue";
import NodeRedToggle from "@/sdk/lib/client/form/components/node-red-toggle.vue";
import NodeRedJsonSchemaForm from "@/sdk/lib/client/form/components/node-red-json-schema-form.vue";
import { installEditorMocks } from "../install-mocks";

config.global.mocks.$i18n = (key: string) => key;

// Register the built-in form components globally, mirroring production
// (createNodeRedVueApp in sdk/lib/client/form/index.ts), so plugin component
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

installEditorMocks();
