<template>
  <div class="nrg-form-app">
    <!-- Vue-driven schema editor tray (renders into a RED tray on open()). -->
    <JsonSchemaEditorInputTray ref="schemaTray" />
    <!-- 1. Node fields (schema-driven, name first) -->
    <div style="width: 100%; padding-bottom: 12px">
      <NodeRedNodeForm
        :node="localNode"
        :schema="schema"
        :errors="errors"
        style="width: 100%"
      />
    </div>

    <!-- 2. Ports Settings -->
    <PortsSettings :features="features" />
  </div>
</template>

<script lang="ts">
import { type JSONSchemaType } from "ajv";
import type { PropType } from "vue";
import { defineComponent, shallowRef } from "vue";
import { debounce } from "es-toolkit";
import { validateForm } from "../validation";
import { computeSchemaStringErrors } from "./composables/ports-logic";
import type { NodeFeatures, NodeRedNode } from "../types";
// Framework-internal: the built-in schema fields' editor tray. Registered
// locally (NOT globally) — only this form uses it.
import JsonSchemaEditorInputTray from "./components/app/json-schema-editor-input-tray.vue";
import PortsSettings from "./components/app/ports/ports-settings.vue";

export default defineComponent({
  name: "NodeRedVueApp",
  components: { JsonSchemaEditorInputTray, PortsSettings },
  provide() {
    return {
      __nrg_form_node: this.localNode,
      __nrg_form_schema: this.schema,
      __nrg_form_errors: this.errors,
      __nrg_features: this.features,
      // Lazy arrow so the tray ref is resolved at call time (bound by then),
      // not when provide() runs. PortsSettings opens the tray owned here.
      __nrg_open_schema_tray: (
        title: string,
        value: string,
        onSave: (value: string) => void,
      ) => this.schemaTrayRef().open(title, value, onSave),
    };
  },
  props: {
    node: {
      type: Object as PropType<NodeRedNode>,
      required: true,
    },
    schema: {
      type: Object as PropType<JSONSchemaType<any>>,
      required: true,
    },
    features: {
      type: Object as PropType<NodeFeatures>,
      required: true,
    },
  },
  setup() {
    return {
      debouncedValidate: shallowRef<
        (((...args: any[]) => void) & { cancel?: () => void }) | null
      >(null),
    };
  },
  data() {
    return {
      localNode: this.node,
      errors: {} as Record<string, string>,
    };
  },
  created() {
    // Debounce validation so rapid keystrokes don't trigger AJV on every
    // character. 150ms is fast enough to feel instant while batching bursts.
    this.debouncedValidate = debounce(() => this.validate(), 150);
  },
  beforeMount() {
    // Per-port output maps: give each node its own objects (the injected
    // defaults may be shared {} references) so edits don't leak across nodes.
    // Clone whichever maps the node actually declares — not gated on a runtime
    // `outputsSchema`, since a types-first node can declare `outputContextModes`
    // (etc.) with no output schema at all.
    for (const key of [
      "validateOutputs",
      "validateOutputTypes",
      "outputContextModes",
      "outputSchemas",
    ] as const) {
      const existing = this.localNode[key];
      if (existing && typeof existing === "object") {
        this.localNode[key] = { ...existing };
      }
    }

    // Normalize array-typed properties to actual arrays. Nodes saved with an
    // older version of the code may have stored array values as comma-separated
    // strings; this ensures validation and future saves always see real arrays.
    if (this.schema?.properties) {
      for (const [prop, propSchema] of Object.entries(this.schema.properties)) {
        if (
          (propSchema as any).type === "array" &&
          !Array.isArray(this.localNode[prop])
        ) {
          const val = this.localNode[prop];
          this.localNode[prop] = val
            ? String(val).split(",").filter(Boolean)
            : [];
        }
      }
    }

    // Set __PWD__ for password fields whose value is missing (server has it
    // but didn't send it). If the value is still present (e.g. not yet
    // deployed), keep it so the form can validate and display it.
    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        if (
          this.localNode._def.credentials[prop].type === "password" &&
          this.localNode.credentials[`has_${prop}`] &&
          !this.localNode.credentials[prop]
        ) {
          this.localNode.credentials[prop] = "__PWD__";
        }
      });
    }

    // Run initial validation synchronously (no debounce) so the form opens
    // with errors already visible.
    this.validate();

    if (this.localNode._def.defaults) {
      Object.keys(this.localNode._def.defaults).forEach((prop) => {
        this.$watch(
          () => this.localNode[prop],
          () => {
            this.debouncedValidate?.();
          },
          { deep: true },
        );
      });
    }

    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        this.$watch(
          () => this.localNode.credentials[prop],
          (newVal: any, oldVal: any) => {
            this.debouncedValidate?.();

            if (
              this.localNode._def.credentials[prop].type === "password" &&
              newVal !== oldVal
            ) {
              this.localNode.credentials[`has_${prop}`] = !!newVal;
            }
          },
          { deep: true },
        );
      });
    }
  },
  beforeUnmount() {
    // Cancel any pending debounced validation so it doesn't fire after unmount.
    this.debouncedValidate?.cancel?.();

    // NOTE: must set credentials prop to undefined to avoid updating it to __PWD__ in the server
    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        if (
          this.localNode._def.credentials[prop].type === "password" &&
          this.localNode.credentials?.[`has_${prop}`] &&
          this.localNode.credentials?.[prop] === "__PWD__"
        ) {
          this.localNode.credentials[prop] = undefined;
        }
      });
    }
  },
  methods: {
    validate() {
      const newErrors = validateForm(this.localNode, this.schema);
      Object.assign(
        newErrors,
        computeSchemaStringErrors(this.localNode, this.schema, this.features),
      );
      const keys = Object.keys(this.errors);
      for (let i = 0; i < keys.length; i++) delete this.errors[keys[i]];
      Object.assign(this.errors, newErrors);
    },
    /** The Vue schema-editor tray component (locally registered), typed. Owned
     * by app.vue and exposed to PortsSettings via the `__nrg_open_schema_tray`
     * provide. */
    schemaTrayRef(): {
      open(title: string, value: string, onSave: (value: string) => void): void;
    } {
      return this.$refs.schemaTray as {
        open(
          title: string,
          value: string,
          onSave: (value: string) => void,
        ): void;
      };
    },
  },
});
</script>

<style scoped>
/* Root wrapper guarantees breathing room below the last section so it never
   butts against the edit tray's bottom edge, regardless of which section ends
   the form. */
.nrg-form-app {
  padding-bottom: 16px;
}

:deep(.node-red-vue-input-error-message) {
  color: var(--red-ui-text-color-error);
}

:deep(.form-row input[type="text"]),
:deep(.form-row input[type="number"]),
:deep(.form-row input[type="password"]) {
  height: 34px;
  padding: 0 8px;
  box-sizing: border-box;
}
</style>
