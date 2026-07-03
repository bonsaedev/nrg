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
