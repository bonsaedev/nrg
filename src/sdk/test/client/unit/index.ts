export type { MockRED, MockEditor } from "../mocks";
export { createRED, createJQuery } from "../mocks";
export { useFormNode } from "@/sdk/lib/client/form/composables/use-form-node";
// Pure identity helper (split from the Vue-importing registration module) so a
// module under test can import it from the harness-aliased `@bonsae/nrg/client`.
export { defineNode } from "@/sdk/lib/client/define-node";

// The editor-runtime registration functions are unavailable in tests — stubbed
// in the shared mocks so an accidental import gives a clear error.
export { registerType, registerTypes } from "../mocks";
