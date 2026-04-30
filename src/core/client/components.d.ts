/**
 * Global component type declarations for Volar / Vue Language Server.
 * Provides autocompletion and type-checking for NRG form components
 * used inside Vue SFC <template> blocks.
 */

export {};

declare module "vue" {
  export interface GlobalComponents {
    NodeRedInput: (typeof import("./components/node-red-input.vue"))["default"];
    NodeRedTypedInput: (typeof import("./components/node-red-typed-input.vue"))["default"];
    NodeRedConfigInput: (typeof import("./components/node-red-config-input.vue"))["default"];
    NodeRedSelectInput: (typeof import("./components/node-red-select-input.vue"))["default"];
    NodeRedEditorInput: (typeof import("./components/node-red-editor-input.vue"))["default"];
    NodeRedInputLabel: (typeof import("./components/node-red-input-label.vue"))["default"];
    NodeRedToggle: (typeof import("./components/node-red-toggle.vue"))["default"];
    NodeRedJsonSchemaForm: (typeof import("./components/node-red-json-schema-form.vue"))["default"];
  }
}
