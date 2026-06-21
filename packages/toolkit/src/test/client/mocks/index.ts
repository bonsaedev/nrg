// Mocks for the client test harness. `red` mocks the Node-RED editor API (the
// `RED` global); `jquery` mocks the editor's jQuery (`$`). The unit/component
// setups install both on `window`. Import everything from here.
export * from "./red";
export * from "./jquery";
