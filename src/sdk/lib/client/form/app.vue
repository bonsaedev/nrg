<template>
  <div class="nrg-form-app">
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

      <!-- Input — a single Validate Data row, rendered as a table so it matches
           the Outputs / Lifecycle Output Ports sections (muted headers) instead
           of a bright toggle label that outweighs the section title. -->
      <div v-if="features.hasInputSchema" class="nrg-subsection">
        <div class="nrg-subsection-title">
          {{ resolveLabel("sections.input", "Input") }}
        </div>
        <table class="nrg-input">
          <thead>
            <tr>
              <th class="nrg-outputs-label">
                {{ resolveLabel("outputs.label", "Label") }}
              </th>
              <th class="nrg-outputs-flag">
                {{ resolveLabel("toggles.validateInput", "Validate Data") }}
              </th>
              <th
                v-if="typeCheckEnabled && supportsInputTypeValidation"
                class="nrg-outputs-flag"
              >
                {{
                  resolveLabel("toggles.validateInputTypes", "Validate Types")
                }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="nrg-outputs-label">{{ inputLabel }}</td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.validateInput"
                  :aria-label="
                    resolveLabel('toggles.validateInput', 'Validate Data')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.validateInput = val;
                    }
                  "
                />
              </td>
              <td
                v-if="typeCheckEnabled && supportsInputTypeValidation"
                class="nrg-outputs-flag"
              >
                <NodeRedToggle
                  :model-value="localNode.validateInputTypes"
                  :aria-label="
                    resolveLabel('toggles.validateInputTypes', 'Validate Types')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.validateInputTypes = val;
                    }
                  "
                />
              </td>
            </tr>
          </tbody>
        </table>
        <ul class="nrg-help-list">
          <li>
            <strong>{{
              resolveLabel("toggles.validateInput", "Validate Data")
            }}</strong>
            —
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
          </li>
          <li v-if="typeCheckEnabled && supportsInputTypeValidation">
            <strong>{{
              resolveLabel("toggles.validateInputTypes", "Validate Types")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateInputTypes",
                "Type-check wires connected to this input on deploy (TypeScript).",
              )
            }}
          </li>
        </ul>
      </div>

      <!-- Outputs -->
      <div v-if="showOutputs && outputRows.length" class="nrg-subsection">
        <div class="nrg-subsection-title">
          {{ resolveLabel("sections.outputs", "Outputs") }}
        </div>
        <table class="nrg-outputs">
          <thead>
            <tr>
              <th class="nrg-outputs-index">
                {{ resolveLabel("outputs.port", "Port") }}
              </th>
              <th class="nrg-outputs-label">
                {{ resolveLabel("outputs.label", "Label") }}
              </th>
              <th class="nrg-outputs-flag">
                {{ resolveLabel("outputs.validate", "Validate Data") }}
              </th>
              <th
                v-if="typeCheckEnabled && supportsOutputTypeValidation"
                class="nrg-outputs-flag"
              >
                {{ resolveLabel("outputs.validateTypes", "Validate Types") }}
              </th>
              <th
                v-if="hasOutputReturnProperties"
                class="nrg-outputs-return-col"
              >
                {{ resolveLabel("outputs.returnProperty", "Return Property") }}
              </th>
              <th v-if="hasOutputContextModes" class="nrg-outputs-context-col">
                {{ resolveLabel("outputs.contextMode", "Context Mode") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="port in outputRows" :key="port.index">
              <td class="nrg-outputs-index">{{ port.index }}</td>
              <td class="nrg-outputs-label">{{ port.label }}</td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="validateOutputFor(port.index)"
                  :aria-label="`${resolveLabel('outputs.validate', 'Validate Data')} — ${port.label}`"
                  @update:model-value="
                    (val: boolean) => setValidateOutput(port.index, val)
                  "
                />
              </td>
              <td
                v-if="typeCheckEnabled && supportsOutputTypeValidation"
                class="nrg-outputs-flag"
              >
                <NodeRedToggle
                  :model-value="validateOutputTypesFor(port.index)"
                  :aria-label="`${resolveLabel('outputs.validateTypes', 'Validate Types')} — ${port.label}`"
                  @update:model-value="
                    (val: boolean) => setValidateOutputTypes(port.index, val)
                  "
                />
              </td>
              <td
                v-if="hasOutputReturnProperties"
                class="nrg-outputs-return-col"
              >
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
              <td v-if="hasOutputContextModes" class="nrg-outputs-context-col">
                <select
                  class="nrg-outputs-context"
                  :value="contextModeFor(port.index)"
                  :disabled="!contextModeEnabled(port.index)"
                  @change="
                    (e) =>
                      setContextMode(
                        port.index,
                        (e.target as HTMLSelectElement).value,
                      )
                  "
                >
                  <option
                    v-for="opt in contextModeOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <ul class="nrg-help-list">
          <li>
            <strong>{{
              resolveLabel("outputs.validate", "Validate Data")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateData",
                "Check the sent value against this port's schema before it is emitted.",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#output-schema')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="typeCheckEnabled && supportsOutputTypeValidation">
            <strong>{{
              resolveLabel("outputs.validateTypes", "Validate Types")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.validateTypes",
                "Type-check wires from this port on deploy (TypeScript).",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#output-schema')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="hasOutputReturnProperties">
            <strong>{{
              resolveLabel("outputs.returnProperty", "Return Property")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.returnProperty",
                "The message property the sent value is placed on (default: output).",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#overriding-the-return-key')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
          <li v-if="hasOutputContextModes">
            <strong>{{
              resolveLabel("outputs.contextMode", "Context Mode")
            }}</strong>
            —
            {{
              resolveLabel(
                "help.contextMode",
                "How the incoming message is carried to this port: carry, trace, or reset.",
              )
            }}
            <a
              class="nrg-help-link"
              :href="docsUrl('/guide/schemas#context-modes')"
              target="_blank"
              rel="noopener noreferrer"
              >{{ resolveLabel("help.learnMore", "Learn more") }}</a
            >
          </li>
        </ul>
      </div>

      <!-- Lifecycle ports: extra output ports, a subsection of Ports Settings -->
      <div v-if="hasBuiltinPorts" class="nrg-subsection">
        <div class="nrg-subsection-title">
          {{
            resolveLabel("sections.lifecyclePorts", "Lifecycle Output Ports")
          }}
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
            :href="docsUrl('/guide/creating-a-node#lifecycle-output-ports')"
            target="_blank"
            rel="noopener noreferrer"
            >{{ resolveLabel("help.learnMore", "Learn more") }}</a
          >
        </div>
        <table class="nrg-lifecycle">
          <thead>
            <tr>
              <th class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.port", "Port") }}
              </th>
              <th class="nrg-outputs-flag">
                {{ resolveLabel("lifecyclePorts.enable", "Enable") }}
              </th>
              <th class="nrg-lifecycle-desc">
                {{ resolveLabel("lifecyclePorts.description", "Description") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="hasErrorPort">
              <td class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.error.name", "Error") }}
              </td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.errorPort"
                  :aria-label="resolveLabel('toggles.errorPort', 'Error Port')"
                  @update:model-value="
                    (val: boolean) => {
                      localNode.errorPort = val;
                      recalculateOutputs();
                    }
                  "
                />
              </td>
              <td class="nrg-lifecycle-desc">
                {{
                  resolveLabel(
                    "lifecyclePorts.error.description",
                    "Routes the message to a separate output when this node fails, so you can handle errors on their own wire.",
                  )
                }}
              </td>
            </tr>
            <tr v-if="hasCompletePort">
              <td class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.complete.name", "Complete") }}
              </td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.completePort"
                  :aria-label="
                    resolveLabel('toggles.completePort', 'Complete Port')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.completePort = val;
                      recalculateOutputs();
                    }
                  "
                />
              </td>
              <td class="nrg-lifecycle-desc">
                {{
                  resolveLabel(
                    "lifecyclePorts.complete.description",
                    "Emits a message from a separate output once this node finishes, so you can trigger what comes next.",
                  )
                }}
              </td>
            </tr>
            <tr v-if="hasStatusPort">
              <td class="nrg-lifecycle-port">
                {{ resolveLabel("lifecyclePorts.status.name", "Status") }}
              </td>
              <td class="nrg-outputs-flag">
                <NodeRedToggle
                  :model-value="localNode.statusPort"
                  :aria-label="
                    resolveLabel('toggles.statusPort', 'Status Port')
                  "
                  @update:model-value="
                    (val: boolean) => {
                      localNode.statusPort = val;
                      recalculateOutputs();
                    }
                  "
                />
              </td>
              <td class="nrg-lifecycle-desc">
                {{
                  resolveLabel(
                    "lifecyclePorts.status.description",
                    "Emits a message from a separate output whenever this node's status changes, so your flow can react.",
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
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
import { typeCheckEnabled } from "../wire-check/availability";
import type { NodeFeatures, NodeRedNode } from "../types";

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
      // Reactive: the Validate Types controls render only when the type-check
      // plugin is installed and enabled (unwrapped for the template).
      typeCheckEnabled,
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
    hasOutputContextModes(): boolean {
      return this.schema?.properties?.outputContextModes !== undefined;
    },
    /**
     * Whether THIS node offers input/output type-checking. The build injects the
     * `validateInputTypes` / `validateOutputTypes` default only for nodes with a
     * typed input / typed outputs, so its presence on the node definition is the
     * node's opt-in. The Validate Types column renders only when the node offers
     * it AND the type-check plugin is installed ({@link typeCheckEnabled}).
     */
    supportsInputTypeValidation(): boolean {
      return this.node._def?.defaults?.validateInputTypes !== undefined;
    },
    supportsOutputTypeValidation(): boolean {
      return this.node._def?.defaults?.validateOutputTypes !== undefined;
    },
    /**
     * The node author's per-port context-mode defaults, declared in the schema.
     * A port present here is configurable (its dropdown is enabled and seeded to
     * this value); a port absent here is locked to `carry`.
     */
    authorContextModeDefaults(): Record<number, string> {
      return this.schema?.properties?.outputContextModes?.default ?? {};
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
      return (
        this.features.hasInputSchema || this.showOutputs || this.hasBuiltinPorts
      );
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
    /**
     * Label for the single input port, resolved from the node's i18n catalog
     * (`inputLabels.0`, then `inputLabels`) — mirrors createDefaultInputLabels.
     * Falls back to "Input" since there is only ever one input port.
     */
    inputLabel(): string {
      return (
        this.resolveLabel("inputLabels.0", "") ||
        this.resolveLabel("inputLabels", "Input")
      );
    },
    contextModeOptions(): { value: string; label: string }[] {
      return [
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
        "validateOutputTypes",
        "outputContextModes",
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
    validateOutputTypesFor(index: number): boolean {
      return this.localNode.validateOutputTypes?.[index] ?? false;
    },
    setValidateOutputTypes(index: number, checked: boolean) {
      this.localNode.validateOutputTypes = {
        ...(this.localNode.validateOutputTypes ?? {}),
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
    /** Whether the flow author may edit this port's mode — true only when the
     * node author declared a schema default for it; otherwise it is locked. */
    contextModeEnabled(index: number): boolean {
      return this.authorContextModeDefaults[index] !== undefined;
    },
    contextModeFor(index: number): string {
      return (
        this.localNode.outputContextModes?.[index] ??
        this.authorContextModeDefaults[index] ??
        "carry"
      );
    },
    setContextMode(index: number, value: string) {
      this.localNode.outputContextModes = {
        ...(this.localNode.outputContextModes ?? {}),
        [index]: value,
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

/* Lifecycle ports reuse the .nrg-outputs table chrome; PORT/ENABLE size to
   content (nowrap) and DESCRIPTION stays on one line — see the table-layout
   override below. */
.nrg-lifecycle-port {
  white-space: nowrap;
}

/* Left-align the description (overrides the shared centered cell rule, which
   out-specifies a bare class) and keep it — with its Learn more link — on one
   line. Header stays centered like the others. */
.nrg-lifecycle td.nrg-lifecycle-desc {
  text-align: left;
  white-space: nowrap;
  color: var(--red-ui-text-color-disabled, #999);
}

/* Per-column explanations below the input/outputs tables (replaces the old
   per-row Description column — one dash item per column that takes user input). */
.nrg-help-list {
  margin: 4px 0 6px;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--red-ui-text-color-disabled, #999);
}

.nrg-help-list li {
  margin: 1px 0;
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
  /* No width cap: each help sentence lays out on a single line and contributes
     its natural width to the form, so Node-RED sizes the edit tray wide enough
     to show it unwrapped (alongside the no-wrap lifecycle descriptions). */
  white-space: nowrap;
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

.nrg-outputs,
.nrg-lifecycle,
.nrg-input {
  /* Fill the panel so the table grows when the tray is widened. At the default
     tray width this is moot: with the help prose capped (see .nrg-help), the
     table's fixed column-sum is the widest intrinsic element, so Node-RED sizes
     the tray to the table. Dragging the tray wider then stretches the columns. */
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

/* Lifecycle table: auto layout so PORT and ENABLE shrink to their content and
   DESCRIPTION (kept on one line) drives the table's natural width — Node-RED
   then sizes the tray to fit it, so descriptions never wrap. Declared after the
   shared rule so table-layout: auto wins over the fixed default. */
.nrg-lifecycle,
.nrg-input {
  table-layout: auto;
}

/* The Input table holds just Label + Validate Data (+ Validate Types), so unlike
   the Outputs table it needn't span the panel — size it to its content. Declared
   after the shared `width: 100%` so it wins. */
.nrg-input {
  width: auto;
}

.nrg-lifecycle .nrg-outputs-flag,
.nrg-input .nrg-outputs-flag {
  width: auto;
}

.nrg-outputs th,
.nrg-outputs td,
.nrg-lifecycle th,
.nrg-lifecycle td,
.nrg-input th,
.nrg-input td {
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
  border-right: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
  border-bottom: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
}

.nrg-outputs th:last-child,
.nrg-outputs td:last-child,
.nrg-lifecycle th:last-child,
.nrg-lifecycle td:last-child,
.nrg-input th:last-child,
.nrg-input td:last-child {
  border-right: none;
}

.nrg-outputs tbody tr:last-child td,
.nrg-lifecycle tbody tr:last-child td,
.nrg-input tbody tr:last-child td {
  border-bottom: none;
}

.nrg-outputs thead th,
.nrg-lifecycle thead th,
.nrg-input thead th {
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

/* Fixed Label column — long labels truncate with an ellipsis instead of
   widening the table. */
.nrg-outputs-label {
  width: 200px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sized to hold the "Return Property" / "Context Mode" headers on one line; the
   inner input/select fills the column (width: 100%). */
.nrg-outputs-return-col {
  width: 150px;
  white-space: nowrap;
}

.nrg-outputs-context-col {
  width: 130px;
  white-space: nowrap;
}

.nrg-outputs-flag {
  /* Wide enough to keep the English "Validate Data" header on one line; the
     extra width is taken from the auto columns (mostly the roomy Label column).
     No nowrap: longer localized headers wrap to two lines instead of clipping
     under table-layout:fixed + overflow:hidden. */
  width: 116px;
}

/* Center the toggle in the cell. Block-level `flex` (not the component's default
   inline-flex) so the cell's `vertical-align: middle` centers it on the row's
   true center, not the text x-height — otherwise the toggle sits slightly high
   relative to the return-property input / context-mode select in the same row. */
.nrg-outputs-flag .nrg-toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
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

.nrg-outputs-context {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  padding: 0 6px;
  text-align: center;
  border: 1px solid
    var(
      --red-ui-form-input-border-color,
      var(--red-ui-secondary-border-color, #ccc)
    );
  border-radius: 2px;
  background: var(--red-ui-form-input-background, #fff);
  color: var(--red-ui-form-text-color, inherit);
}

.nrg-outputs-context:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Node-RED's global rules force input[type=text] (and select) to 34px with
   their own padding/margin and beat a single scoped class. Re-assert ours at
   higher specificity (.nrg-outputs td .x → wins over .red-ui-editor
   input[type=text]) so the return-property input and context-mode select share
   one height and line up in the row. */
.nrg-outputs td .nrg-outputs-return,
.nrg-outputs td .nrg-outputs-context {
  height: 28px;
  margin: 0;
  padding: 0 6px;
  line-height: normal;
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
