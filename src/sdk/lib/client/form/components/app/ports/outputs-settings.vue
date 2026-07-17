<template>
  <!-- Outputs -->
  <div class="nrg-subsection">
    <div class="nrg-subsection-title">
      {{ resolveLabel("sections.outputs", "Outputs") }}
    </div>
    <table class="nrg-outputs">
      <thead>
        <tr>
          <th class="nrg-outputs-index">
            {{ resolveLabel("outputs.port", "Port") }}
          </th>
          <th class="nrg-cell-label">
            {{ resolveLabel("outputs.label", "Label") }}
          </th>
          <th v-if="hasOutputValidation" class="nrg-cell-flag">
            {{ resolveLabel("outputs.validate", "Validate Data") }}
          </th>
          <th v-if="hasOutputSchemas" class="nrg-cell-flag">
            {{ resolveLabel("outputs.schema", "Data Schema") }}
          </th>
          <th
            v-if="typeCheckEnabled && supportsOutputTypeValidation"
            class="nrg-cell-flag"
          >
            {{ resolveLabel("outputs.validateTypes", "Validate Types") }}
          </th>
          <th v-if="hasOutputContextModes" class="nrg-outputs-context-col">
            {{ resolveLabel("outputs.contextMode", "Context Mode") }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="port in outputRows" :key="port.index">
          <td class="nrg-outputs-index">{{ port.index }}</td>
          <td class="nrg-cell-label">{{ port.label }}</td>
          <td v-if="hasOutputValidation" class="nrg-cell-flag">
            <NodeRedToggle
              :model-value="validateOutputFor(port.index)"
              :aria-label="`${resolveLabel('outputs.validate', 'Validate Data')} — ${port.label}`"
              @update:model-value="
                (val: boolean) => setValidateOutput(port.index, val)
              "
            />
          </td>
          <td v-if="hasOutputSchemas" class="nrg-cell-flag">
            <button
              type="button"
              class="red-ui-button red-ui-button-small nrg-schema-btn"
              :class="{
                'nrg-schema-btn-error':
                  !!errors[`node.outputSchemas.${port.index}`],
              }"
              :title="errors[`node.outputSchemas.${port.index}`] || undefined"
              :disabled="!validateOutputFor(port.index)"
              :aria-label="`${resolveLabel('outputs.schema', 'Data Schema')} — ${port.label}`"
              @click="openOutputSchemaEditor(port.index)"
            >
              <span class="nrg-schema-glyph" aria-hidden="true">
                <svg viewBox="0 0 256 220">
                  <use href="#nrg-json-schema-logo" />
                </svg>
              </span>
            </button>
          </td>
          <td
            v-if="typeCheckEnabled && supportsOutputTypeValidation"
            class="nrg-cell-flag"
          >
            <NodeRedToggle
              :model-value="validateOutputTypesFor(port.index)"
              :aria-label="`${resolveLabel('outputs.validateTypes', 'Validate Types')} — ${port.label}`"
              @update:model-value="
                (val: boolean) => setValidateOutputTypes(port.index, val)
              "
            />
          </td>
          <td v-if="hasOutputContextModes" class="nrg-outputs-context-col">
            <select
              class="nrg-outputs-context"
              :value="contextModeFor(port.index)"
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
        <strong>{{ resolveLabel("outputs.validate", "Validate Data") }}</strong>
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
      <li v-if="hasOutputContextModes">
        <strong>{{
          resolveLabel("outputs.contextMode", "Context Mode")
        }}</strong>
        —
        {{
          resolveLabel(
            "help.contextMode",
            "How this port builds its outgoing message: merge (add this port's fields onto the incoming message) or reset (start a fresh message).",
          )
        }}
        <a
          class="nrg-help-link"
          :href="docsUrl('/guide/message-model#context-modes')"
          target="_blank"
          rel="noopener noreferrer"
          >{{ resolveLabel("help.learnMore", "Learn more") }}</a
        >
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { usePortsSettings } from "../../../composables/use-ports-settings";

const {
  errors,
  typeCheckEnabled,
  hasOutputValidation,
  hasOutputSchemas,
  supportsOutputTypeValidation,
  hasOutputContextModes,
  outputRows,
  contextModeOptions,
  resolveLabel,
  docsUrl,
  validateOutputFor,
  setValidateOutput,
  validateOutputTypesFor,
  setValidateOutputTypes,
  contextModeFor,
  setContextMode,
  openOutputSchemaEditor,
} = usePortsSettings();
</script>

<style scoped>
.nrg-outputs-index {
  width: 3em;
}

/* Sized to hold the "Context Mode" header on one line; the inner select fills
   the column (width: 100%). */
.nrg-outputs-context-col {
  width: 130px;
  white-space: nowrap;
}

.nrg-outputs-context {
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  /* right room for the custom caret */
  padding: 0 22px 0 6px;
  text-align: center;
  border: 1px solid
    var(
      --red-ui-form-input-border-color,
      var(--red-ui-secondary-border-color, #ccc)
    );
  border-radius: 5px;
  /* A native <select> ignores border-radius (notably on macOS), so reset its
     appearance and draw our own caret to get the rounded corners back. */
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--red-ui-form-input-background, #fff);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px 6px;
  color: var(--red-ui-form-text-color, inherit);
}

.nrg-outputs-context:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Node-RED's global rules force select to 34px with their own padding/margin
   and beat a single scoped class. Re-assert ours at higher specificity
   (.nrg-outputs td .x → wins over .red-ui-editor select) so the context-mode
   select keeps its height and lines up in the row. */
.nrg-outputs td .nrg-outputs-context {
  height: 28px;
  margin: 0;
  /* keep the right room for the custom caret (see .nrg-outputs-context) */
  padding: 0 22px 0 6px;
  line-height: normal;
}
</style>
