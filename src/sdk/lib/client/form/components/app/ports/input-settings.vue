<template>
  <!-- Input — a single Validate Data row, rendered as a table so it matches
       the Outputs / Lifecycle Output Ports sections (muted headers) instead
       of a bright toggle label that outweighs the section title. -->
  <div class="nrg-subsection">
    <div class="nrg-subsection-title">
      {{ resolveLabel("sections.input", "Input") }}
    </div>
    <table class="nrg-input">
      <thead>
        <tr>
          <th class="nrg-cell-label">
            {{ resolveLabel("outputs.label", "Label") }}
          </th>
          <th class="nrg-input-root-col">
            {{ resolveLabel("input.inputRoot", "Input Root") }}
          </th>
          <th class="nrg-cell-flag">
            {{ resolveLabel("toggles.validateInput", "Validate Data") }}
          </th>
          <th v-if="acceptsInputSchema" class="nrg-cell-flag">
            {{ resolveLabel("outputs.schema", "Data Schema") }}
          </th>
          <th
            v-if="typeCheckEnabled && supportsInputTypeValidation"
            class="nrg-cell-flag"
          >
            {{ resolveLabel("toggles.validateInputTypes", "Validate Types") }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="nrg-cell-label">{{ inputLabel }}</td>
          <td class="nrg-input-root-col">
            <input
              type="text"
              class="nrg-input-root"
              placeholder="msg"
              :value="localNode.inputRoot ?? ''"
              :aria-label="resolveLabel('input.inputRoot', 'Input Root')"
              @input="
                (e) => {
                  localNode.inputRoot = (e.target as HTMLInputElement).value;
                }
              "
            />
          </td>
          <td class="nrg-cell-flag">
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
          <td v-if="acceptsInputSchema" class="nrg-cell-flag">
            <button
              type="button"
              class="red-ui-button red-ui-button-small nrg-schema-btn"
              :class="{
                'nrg-schema-btn-error': !!errors['node.inputSchema'],
              }"
              :title="errors['node.inputSchema'] || undefined"
              :disabled="!localNode.validateInput"
              :aria-label="`${resolveLabel('outputs.schema', 'Data Schema')} — ${inputLabel}`"
              @click="openInputSchemaEditor()"
            >
              <span class="nrg-schema-glyph" aria-hidden="true">
                <svg viewBox="0 0 256 220">
                  <use href="#nrg-json-schema-logo" />
                </svg>
              </span>
            </button>
          </td>
          <td
            v-if="typeCheckEnabled && supportsInputTypeValidation"
            class="nrg-cell-flag"
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
        <strong>{{ resolveLabel("input.inputRoot", "Input Root") }}</strong>
        —
        {{
          resolveLabel(
            "help.inputRoot",
            "The message property input() reads its fields from. Empty (or 'msg') = the whole message; any other value (e.g. 'output') rebuilds the message rooted there before input() runs.",
          )
        }}
        <a
          class="nrg-help-link"
          :href="docsUrl('/guide/schemas#input-root')"
          target="_blank"
          rel="noopener noreferrer"
          >{{ resolveLabel("help.learnMore", "Learn more") }}</a
        >
      </li>
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
</template>

<script setup lang="ts">
import { usePortsSettings } from "../../../composables/use-ports-settings";

const {
  localNode,
  errors,
  typeCheckEnabled,
  acceptsInputSchema,
  supportsInputTypeValidation,
  inputLabel,
  resolveLabel,
  docsUrl,
  openInputSchemaEditor,
} = usePortsSettings();
</script>

<style scoped>
.nrg-input-root-col {
  width: 120px;
  white-space: nowrap;
}

.nrg-input-root {
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
  border-radius: 5px;
  background: var(--red-ui-form-input-background, #fff);
  color: var(--red-ui-form-text-color, inherit);
}

/* Node-RED's global input[type=text] rules force 34px and beat a single scoped
   class; re-assert ours at higher specificity so the Input Root field matches the
   28px row height used across the ports tables. */
.nrg-input td .nrg-input-root {
  height: 28px;
  margin: 0;
  padding: 0 6px;
  line-height: normal;
}
</style>
