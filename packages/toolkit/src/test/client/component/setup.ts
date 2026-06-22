import { config } from "vitest-browser-vue";
import {
  NodeRedInput,
  NodeRedTypedInput,
  NodeRedConfigInput,
  NodeRedSelectInput,
  NodeRedEditorInput,
  NodeRedInputLabel,
  NodeRedToggle,
  NodeRedJsonSchemaForm,
} from "@bonsae/nrg-runtime/internal/client/components";
import { installEditorMocks } from "../install-mocks";

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

installEditorMocks();
