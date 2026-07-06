// Mocks for the client test harness. `red` mocks the Node-RED editor API (the
// `RED` global); `jquery` mocks the editor's jQuery (`$`). The unit/component
// setups install both on `window`. Import everything from here.
export { createSettings, resetRED, createRED } from "./red";
export type {
  MockEditor,
  MockNotification,
  MockPopover,
  MockTooltip,
  MockSettings,
  MockRED,
} from "./red";
export { getJQueryState, createJQuery } from "./jquery";
export type { MockJQueryState, MockJQueryElement, MockJQuery } from "./jquery";

// `registerType`/`registerTypes` belong to the Node-RED editor runtime, not
// tests — stub them so a module under test that imports one from the
// harness-aliased `@bonsae/nrg/client` gets a clear error, not `undefined`.
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
