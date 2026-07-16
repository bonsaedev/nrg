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
    NodeRedConfigInput: (typeof import("../form/components/lib/inputs/node-red-config-input.vue"))["default"];
    NodeRedEditorInput: (typeof import("../form/components/lib/inputs/node-red-editor-input.vue"))["default"];
    NodeRedInput: (typeof import("../form/components/lib/inputs/node-red-input.vue"))["default"];
    NodeRedInputLabel: (typeof import("../form/components/lib/inputs/node-red-input-label.vue"))["default"];
    NodeRedJsonSchemaForm: (typeof import("../form/components/lib/node-red-json-schema-form.vue"))["default"];
    NodeRedSelectInput: (typeof import("../form/components/lib/inputs/node-red-select-input.vue"))["default"];
    NodeRedToggle: (typeof import("../form/components/lib/inputs/node-red-toggle.vue"))["default"];
    NodeRedTray: (typeof import("../form/components/lib/node-red-tray.vue"))["default"];
    NodeRedTypedInput: (typeof import("../form/components/lib/inputs/node-red-typed-input.vue"))["default"];
  }
}
