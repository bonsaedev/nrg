/**
 * Global component type declarations for Volar / Vue Language Server.
 * Provides autocompletion and type-checking for NRG form components
 * used inside Vue SFC <template> blocks.
 */

export {};

declare module "vue" {
  export interface ComponentCustomProperties {
    $i18n: (label: string) => string;
  }

  export interface GlobalComponents {
    NodeRedInput: (typeof import("./form/components/node-red-input.vue"))["default"];
    NodeRedTypedInput: (typeof import("./form/components/node-red-typed-input.vue"))["default"];
    NodeRedConfigInput: (typeof import("./form/components/node-red-config-input.vue"))["default"];
    NodeRedSelectInput: (typeof import("./form/components/node-red-select-input.vue"))["default"];
    NodeRedEditorInput: (typeof import("./form/components/node-red-editor-input.vue"))["default"];
    NodeRedInputLabel: (typeof import("./form/components/node-red-input-label.vue"))["default"];
    NodeRedToggle: (typeof import("./form/components/node-red-toggle.vue"))["default"];
    NodeRedJsonSchemaForm: (typeof import("./form/components/node-red-json-schema-form.vue"))["default"];
  }
}
