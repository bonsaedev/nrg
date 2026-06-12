<template>
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
  <div v-if="showPortsSettings" class="nrg-section">
    <div class="nrg-section-title">
      {{ resolveLabel("sections.portsSettings", "Ports Settings") }}
    </div>

    <!-- Input -->
    <div v-if="features.hasInputSchema" class="nrg-subsection">
      <div class="nrg-subsection-title">
        {{ resolveLabel("sections.input", "Input") }}
      </div>
      <div class="form-row">
        <NodeRedToggle
          v-model="localNode.validateInput"
          :label="resolveLabel('toggles.validateInput', 'Validate')"
        />
        <div class="nrg-help">
          {{
            resolveLabel(
              "help.validateInput",
              "Validate incoming messages against the input schema before input() runs.",
            )
          }}
          <a
            class="nrg-help-link"
            :href="docsUrl('/guide/schemas#input-schema')"
            target="_blank"
            rel="noopener noreferrer"
            >{{ resolveLabel("help.learnMore", "Learn more") }}</a
          >
        </div>
      </div>
    </div>

    <!-- Outputs -->
    <div v-if="showOutputs && outputRows.length" class="nrg-subsection">
      <div class="nrg-subsection-title">
        {{ resolveLabel("sections.outputs", "Outputs") }}
      </div>
      <div class="nrg-help">
        {{
          resolveLabel(
            "help.outputs",
            "Per-port output settings. Validate checks the sent value against the port's schema; Context Mode controls how the incoming message is carried.",
          )
        }}
        <a
          class="nrg-help-link"
          :href="docsUrl('/guide/creating-a-node#the-editor-form')"
          target="_blank"
          rel="noopener noreferrer"
          >{{ resolveLabel("help.learnMore", "Learn more") }}</a
        >
      </div>
      <table class="nrg-outputs">
        <thead>
          <tr>
            <th class="nrg-outputs-index">
              {{ resolveLabel("outputs.port", "Port") }}
            </th>
            <th>{{ resolveLabel("outputs.label", "Label") }}</th>
            <th class="nrg-outputs-flag">
              {{ resolveLabel("outputs.validate", "Validate") }}
            </th>
            <th v-if="hasOutputReturnProperties">
              {{ resolveLabel("outputs.returnProperty", "Return Property") }}
            </th>
            <th>{{ resolveLabel("outputs.contextMode", "Context Mode") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="port in outputRows" :key="port.index">
            <td class="nrg-outputs-index">{{ port.index }}</td>
            <td>{{ port.label }}</td>
            <td class="nrg-outputs-flag">
              <input
                type="checkbox"
                :checked="validateOutputFor(port.index)"
                @change="
                  (e) =>
                    setValidateOutput(
                      port.index,
                      (e.target as HTMLInputElement).checked,
                    )
                "
              />
            </td>
            <td v-if="hasOutputReturnProperties">
              <input
                type="text"
                class="nrg-outputs-return"
                placeholder="output"
                :value="returnPropertyFor(port.index)"
                @input="
                  (e) =>
                    setReturnProperty(
                      port.index,
                      (e.target as HTMLInputElement).value,
                    )
                "
              />
            </td>
            <td>
              <NodeRedSelectInput
                :value="contextModeFor(port.index)"
                :options="contextModeOptions"
                @update:value="(v: string) => setContextMode(port.index, v)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 3. Lifecycle Ports — its own section, after Ports Settings -->
  <div v-if="hasBuiltinPorts" class="nrg-section">
    <div class="nrg-section-title">
      {{ resolveLabel("sections.lifecyclePorts", "Lifecycle Ports") }}
    </div>
    <div class="nrg-help">
      {{
        resolveLabel(
          "help.lifecyclePorts",
          "Optional extra output ports that fire on error, on completion, and on every status change.",
        )
      }}
      <a
        class="nrg-help-link"
        :href="docsUrl('/guide/creating-a-node#emit-ports')"
        target="_blank"
        rel="noopener noreferrer"
        >{{ resolveLabel("help.learnMore", "Learn more") }}</a
      >
    </div>
    <div class="nrg-toggles-grid">
      <div v-if="hasErrorPort" class="form-row">
        <NodeRedToggle
          :model-value="localNode.errorPort"
          :label="resolveLabel('toggles.errorPort', 'Error Port')"
          @update:model-value="
            (val: boolean) => {
              localNode.errorPort = val;
              recalculateOutputs();
            }
          "
        />
      </div>
      <div v-if="hasCompletePort" class="form-row">
        <NodeRedToggle
          :model-value="localNode.completePort"
          :label="resolveLabel('toggles.completePort', 'Complete Port')"
          @update:model-value="
            (val: boolean) => {
              localNode.completePort = val;
              recalculateOutputs();
            }
          "
        />
      </div>
      <div v-if="hasStatusPort" class="form-row">
        <NodeRedToggle
          :model-value="localNode.statusPort"
          :label="resolveLabel('toggles.statusPort', 'Status Port')"
          @update:model-value="
            (val: boolean) => {
              localNode.statusPort = val;
              recalculateOutputs();
            }
          "
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { type JSONSchemaType } from "ajv";
import type { PropType } from "vue";
import { defineComponent, shallowRef } from "vue";
import { debounce } from "es-toolkit";
import { validateForm } from "../validation";
import type { NodeRedNode, NodeFeatures } from "../types";

export default defineComponent({
  name: "NodeRedVueApp",
  provide() {
    return {
      __nrg_form_node: this.localNode,
      __nrg_form_schema: this.schema,
      __nrg_form_errors: this.errors,
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
  computed: {
    hasOutputReturnProperties(): boolean {
      return this.schema?.properties?.outputReturnProperties !== undefined;
    },
    hasErrorPort(): boolean {
      return this.schema?.properties?.errorPort !== undefined;
    },
    hasCompletePort(): boolean {
      return this.schema?.properties?.completePort !== undefined;
    },
    hasStatusPort(): boolean {
      return this.schema?.properties?.statusPort !== undefined;
    },
    hasBuiltinPorts(): boolean {
      return this.hasErrorPort || this.hasCompletePort || this.hasStatusPort;
    },
    showOutputs(): boolean {
      return this.features.hasOutputSchema;
    },
    showPortsSettings(): boolean {
      return this.features.hasInputSchema || this.showOutputs;
    },
    /**
     * Base output ports to render in the Outputs table. Reactive: a node with
     * dynamic outputs updates `localNode.outputs` (e.g. from a config field), so
     * the table grows/shrinks with it. The base count is the total minus the
     * enabled lifecycle ports; labels reuse the static `features.outputPorts`
     * when present, otherwise fall back to `Output {index}`.
     */
    outputRows(): { index: number; label: string }[] {
      const builtins =
        (this.localNode.errorPort ? 1 : 0) +
        (this.localNode.completePort ? 1 : 0) +
        (this.localNode.statusPort ? 1 : 0);
      const total =
        typeof this.localNode.outputs === "number"
          ? this.localNode.outputs
          : null;
      // Base = total minus the enabled lifecycle ports when the count is
      // consistent; otherwise fall back to the static, schema-derived count
      // (e.g. a flow that toggled a lifecycle port without updating `outputs`).
      const base =
        total !== null && total >= builtins
          ? total - builtins
          : this.features.outputPorts.length;
      return Array.from({ length: base }, (_, index) => ({
        index,
        label: this.features.outputPorts[index]?.label ?? `Output ${index}`,
      }));
    },
    contextModeOptions(): { value: string; label: string }[] {
      return [
        {
          value: "default",
          label: this.resolveLabel("contextModes.modes.default", "Default"),
        },
        {
          value: "carry",
          label: this.resolveLabel("contextModes.modes.carry", "carry"),
        },
        {
          value: "trace",
          label: this.resolveLabel("contextModes.modes.trace", "trace"),
        },
        {
          value: "reset",
          label: this.resolveLabel("contextModes.modes.reset", "reset"),
        },
      ];
    },
  },
  created() {
    // Debounce validation so rapid keystrokes don't trigger AJV on every
    // character. 150ms is fast enough to feel instant while batching bursts.
    this.debouncedValidate = debounce(() => this.validate(), 150);
  },
  beforeMount() {
    // Per-port output maps: give each node its own objects (the injected
    // defaults may be shared {} references) so edits don't leak across nodes.
    if (this.features.hasOutputSchema) {
      for (const key of [
        "validateOutputs",
        "contextModes",
        "outputReturnProperties",
      ] as const) {
        const existing = this.localNode[key];
        this.localNode[key] =
          existing && typeof existing === "object" ? { ...existing } : {};
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
      const keys = Object.keys(this.errors);
      for (let i = 0; i < keys.length; i++) delete this.errors[keys[i]];
      Object.assign(this.errors, newErrors);
    },
    resolveLabel(key: string, fallback: string): string {
      const resolved = this.$i18n(key);
      const fullKey = `${this.localNode.type}.${key}`;
      if (resolved && resolved !== fullKey && resolved !== key) {
        return resolved;
      }
      return fallback;
    },
    docsUrl(path: string): string {
      return `https://bonsaedev.github.io/nrg${path}`;
    },
    recalculateOutputs() {
      const baseOutputs = this.localNode._def?.outputs ?? 0;
      let count = baseOutputs;
      if (this.localNode.errorPort) count++;
      if (this.localNode.completePort) count++;
      if (this.localNode.statusPort) count++;
      this.localNode.outputs = count;
    },
    validateOutputFor(index: number): boolean {
      return this.localNode.validateOutputs?.[index] ?? false;
    },
    setValidateOutput(index: number, checked: boolean) {
      this.localNode.validateOutputs = {
        ...(this.localNode.validateOutputs ?? {}),
        [index]: checked,
      };
    },
    returnPropertyFor(index: number): string {
      return this.localNode.outputReturnProperties?.[index] ?? "";
    },
    setReturnProperty(index: number, value: string) {
      const next = { ...(this.localNode.outputReturnProperties ?? {}) };
      if (value.trim()) {
        next[index] = value;
      } else {
        delete next[index];
      }
      this.localNode.outputReturnProperties = next;
    },
    contextModeFor(index: number): string {
      return this.localNode.contextModes?.[index] ?? "default";
    },
    setContextMode(index: number, value: string) {
      const next = { ...(this.localNode.contextModes ?? {}) };
      if (value === "default") {
        delete next[index];
      } else {
        next[index] = value;
      }
      this.localNode.contextModes = next;
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

.nrg-toggles-grid .form-row {
  margin-bottom: 0;
}

.nrg-section {
  border-top: 1px solid var(--red-ui-secondary-border-color, #ddd);
  margin-top: 12px;
  padding-top: 8px;
}

.nrg-section-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 8px;
}

.nrg-help {
  font-size: 11px;
  line-height: 1.4;
  color: var(--red-ui-text-color-disabled, #999);
  margin: 2px 0 6px;
}

.nrg-help-link {
  color: var(--red-ui-text-color-link, #2196f3);
  white-space: nowrap;
}

.nrg-help-link:hover {
  text-decoration: underline;
}

.nrg-subsection {
  margin-bottom: 10px;
}

.nrg-subsection-title {
  font-weight: bold;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--red-ui-text-color-disabled, #777);
  margin: 6px 0 4px;
}

.nrg-outputs {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  margin-top: 6px;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--red-ui-secondary-border-color, #d9d9d9);
  border-radius: 3px;
  overflow: hidden;
  font-size: 12px;
}

.nrg-outputs th,
.nrg-outputs td {
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
  border-right: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
  border-bottom: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
}

.nrg-outputs th:last-child,
.nrg-outputs td:last-child {
  border-right: none;
}

.nrg-outputs tbody tr:last-child td {
  border-bottom: none;
}

.nrg-outputs thead th {
  background: var(--red-ui-tertiary-background, #f3f3f3);
  color: var(--red-ui-text-color-disabled, #777);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.nrg-outputs-index {
  width: 3em;
}

.nrg-outputs-flag {
  width: 4.5em;
}

.nrg-outputs-flag input {
  margin: 0;
  vertical-align: middle;
}

.nrg-outputs-return {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  padding: 0 6px;
  text-align: left;
  border: 1px solid
    var(
      --red-ui-form-input-border-color,
      var(--red-ui-secondary-border-color, #ccc)
    );
  border-radius: 2px;
  background: var(--red-ui-form-input-background, #fff);
  color: var(--red-ui-form-text-color, inherit);
}

/* keep the context-mode select compact and centered in its cell */
.nrg-outputs :deep(.node-input-select) {
  text-align: center;
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
