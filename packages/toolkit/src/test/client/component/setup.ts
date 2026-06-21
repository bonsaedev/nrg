import "../globals";
import { beforeEach } from "vitest";
import { config } from "vitest-browser-vue";
import { createRED, createJQuery, resetRED } from "../mocks";
import { NodeRedInput } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedTypedInput } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedConfigInput } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedSelectInput } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedEditorInput } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedInputLabel } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedToggle } from "@bonsae/nrg-runtime/internal/client/components";
import { NodeRedJsonSchemaForm } from "@bonsae/nrg-runtime/internal/client/components";

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
