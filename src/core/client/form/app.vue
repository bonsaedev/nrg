<template>
  <div
    v-if="features.hasInputSchema || features.hasOutputSchema"
    class="form-row nrg-toggles-grid"
  >
    <div v-if="features.hasInputSchema">
      <NodeRedToggle
        :model-value="localNode.validateInput"
        :label="resolveLabel('toggles.validateInput', 'Validate Input')"
        @update:model-value="localNode.validateInput = $event"
      />
    </div>
    <div v-if="features.hasOutputSchema">
      <NodeRedToggle
        :model-value="localNode.validateOutput"
        :label="resolveLabel('toggles.validateOutput', 'Validate Output')"
        @update:model-value="localNode.validateOutput = $event"
      />
    </div>
  </div>
  <div v-if="hasEmitPorts" class="form-row nrg-toggles-grid">
    <div v-if="hasEmitError">
      <NodeRedToggle
        :model-value="localNode.emitError"
        :label="resolveLabel('toggles.errorPort', 'Error Port')"
        @update:model-value="
          (val: boolean) => {
            localNode.emitError = val;
            recalculateOutputs();
          }
        "
      />
    </div>
    <div v-if="hasEmitComplete">
      <NodeRedToggle
        :model-value="localNode.emitComplete"
        :label="resolveLabel('toggles.completePort', 'Complete Port')"
        @update:model-value="
          (val: boolean) => {
            localNode.emitComplete = val;
            recalculateOutputs();
          }
        "
      />
    </div>
    <div v-if="hasEmitStatus">
      <NodeRedToggle
        :model-value="localNode.emitStatus"
        :label="resolveLabel('toggles.statusPort', 'Status Port')"
        @update:model-value="
          (val: boolean) => {
            localNode.emitStatus = val;
            recalculateOutputs();
          }
        "
      />
    </div>
  </div>
  <div style="width: 100%; padding-bottom: 12px">
    <NodeRedNodeForm
      :node="localNode"
      :schema="schema"
      :errors="errors"
      style="width: 100%"
    />
  </div>
</template>

<script lang="ts">
import { type JSONSchemaType } from "ajv";
import type { PropType } from "vue";
import { defineComponent } from "vue";
import { debounce } from "es-toolkit";
import { validateForm } from "../validation";

export default defineComponent({
  name: "NodeRedVueApp",
  props: {
    node: {
      type: Object,
      required: true,
    },
    schema: {
      type: Object as PropType<JSONSchemaType<any>>,
      required: true,
    },
    features: {
      type: Object as PropType<{
        hasInputSchema: boolean;
        hasOutputSchema: boolean;
      }>,
      required: true,
    },
  },
  data() {
    return {
      localNode: this.node,
      errors: {} as Record<string, string>,
    };
  },
  computed: {
    hasEmitError(): boolean {
      return this.schema?.properties?.emitError !== undefined;
    },
    hasEmitComplete(): boolean {
      return this.schema?.properties?.emitComplete !== undefined;
    },
    hasEmitStatus(): boolean {
      return this.schema?.properties?.emitStatus !== undefined;
    },
    hasEmitPorts(): boolean {
      return this.hasEmitError || this.hasEmitComplete || this.hasEmitStatus;
    },
  },
  created() {
    // Debounce validation so rapid keystrokes don't trigger AJV on every
    // character. 150ms is fast enough to feel instant while batching bursts.
    this.debouncedValidate = debounce(() => this.validate(), 150);
  },
  beforeMount() {
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
            this.debouncedValidate();
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
            this.debouncedValidate();

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
      this.errors = validateForm(this.localNode, this.schema);
    },
    resolveLabel(key: string, fallback: string): string {
      const resolved = this.$i18n(key);
      const fullKey = `${this.localNode.type}.${key}`;
      if (resolved && resolved !== fullKey && resolved !== key) {
        return resolved;
      }
      return fallback;
    },
    recalculateOutputs() {
      const baseOutputs = this.localNode._def?.outputs ?? 0;
      let count = baseOutputs;
      if (this.localNode.emitError) count++;
      if (this.localNode.emitComplete) count++;
      if (this.localNode.emitStatus) count++;
      this.localNode.outputs = count;
    },
  },
});
</script>

<style scoped>
.nrg-toggles-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px 16px;
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
