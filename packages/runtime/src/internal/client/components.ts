// Test-support surface: the real form components, for @bonsae/nrg's component
// test harness to mount. NOT public API. Built with `vue` external so the
// consumer's test environment supplies its own Vue. Kept separate from
// ./index.ts so that barrel stays .vue-free. See ../README.md.
export { default as NodeRedInput } from "../../client/form/components/node-red-input.vue";
export { default as NodeRedTypedInput } from "../../client/form/components/node-red-typed-input.vue";
export { default as NodeRedConfigInput } from "../../client/form/components/node-red-config-input.vue";
export { default as NodeRedSelectInput } from "../../client/form/components/node-red-select-input.vue";
export { default as NodeRedEditorInput } from "../../client/form/components/node-red-editor-input.vue";
export { default as NodeRedInputLabel } from "../../client/form/components/node-red-input-label.vue";
export { default as NodeRedToggle } from "../../client/form/components/node-red-toggle.vue";
export { default as NodeRedJsonSchemaForm } from "../../client/form/components/node-red-json-schema-form.vue";
