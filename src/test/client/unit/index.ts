export type { MockRED, MockEditor } from "../mocks";
export { createRED, createJQuery } from "../mocks";
export { useFormNode } from "@/core/client/form/composables/use-form-node";
// Pure identity helper (split from the Vue-importing registration module) so a
// module under test can import it from the harness-aliased `@bonsae/nrg/client`.
export { defineNode } from "@/core/client/define-node";

// The editor-runtime registration functions are unavailable in tests — stub so
// an accidental import gives a clear error, not `undefined is not a function`.
export function registerType(): never {
  throw new Error(
    "registerType is not available in the test harness — node registration " +
      "happens in the Node-RED editor runtime.",
  );
}
export function registerTypes(): never {
  throw new Error(
    "registerTypes is not available in the test harness — node registration " +
      "happens in the Node-RED editor runtime.",
  );
}
