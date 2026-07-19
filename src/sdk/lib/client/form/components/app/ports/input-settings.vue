<template>
  <!-- Input — a single Validate Data row, rendered as a table so it matches
       the Outputs / Lifecycle Output Ports sections (muted headers) instead
       of a bright toggle label that outweighs the section title. -->
  <div class="nrg-subsection">
    <div class="nrg-subsection-title">
      {{ resolveLabel("portSettings.inputsTable.section", "Input") }}
    </div>
    <div class="nrg-table-scroll">
      <table class="nrg-input">
        <thead>
          <tr>
            <th class="nrg-cell-label">
              {{ resolveLabel("portSettings.inputsTable.label", "Label") }}
            </th>
            <th class="nrg-cell-flag">
              {{
                resolveLabel(
                  "portSettings.inputsTable.validate",
                  "Validate Data",
                )
              }}
            </th>
            <th v-if="acceptsInputSchema" class="nrg-cell-flag">
              {{
                resolveLabel("portSettings.inputsTable.schema", "Data Schema")
              }}
            </th>
            <th
              v-if="typeCheckEnabled && supportsInputTypeValidation"
              class="nrg-cell-flag"
            >
              {{
                resolveLabel(
                  "portSettings.inputsTable.validateTypes",
                  "Validate Types",
                )
              }}
            </th>
            <th class="nrg-cell-desc">
              {{
                resolveLabel(
                  "portSettings.inputsTable.description",
                  "Description",
                )
              }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="nrg-cell-label">{{ inputLabel }}</td>
            <td class="nrg-cell-flag">
              <NodeRedToggle
                :model-value="localNode.validateInput"
                :aria-label="
                  resolveLabel(
                    'portSettings.inputsTable.validate',
                    'Validate Data',
                  )
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
                :aria-label="`${resolveLabel('portSettings.inputsTable.schema', 'Data Schema')} — ${inputLabel}`"
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
                  resolveLabel(
                    'portSettings.inputsTable.validateTypes',
                    'Validate Types',
                  )
                "
                @update:model-value="
                  (val: boolean) => {
                    localNode.validateInputTypes = val;
                  }
                "
              />
            </td>
            <td class="nrg-cell-desc">
              {{ resolveLabel("input.description", "") }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="nrg-help-list">
      <li>
        <strong>{{
          resolveLabel("portSettings.inputsTable.validate", "Validate Data")
        }}</strong>
        —
        {{
          resolveLabel(
            "portSettings.inputsTable.help.validate",
            "Validate incoming messages against the input schema before input() runs.",
          )
        }}
        <a
          class="nrg-help-link"
          :href="docsUrl('/guide/schemas#input-schema')"
          target="_blank"
          rel="noopener noreferrer"
          >{{
            resolveLabel(
              "portSettings.inputsTable.help.learnMore",
              "Learn more",
            )
          }}</a
        >
      </li>
      <li v-if="typeCheckEnabled && supportsInputTypeValidation">
        <strong>{{
          resolveLabel(
            "portSettings.inputsTable.validateTypes",
            "Validate Types",
          )
        }}</strong>
        —
        {{
          resolveLabel(
            "portSettings.inputsTable.help.validateTypes",
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

<style scoped></style>
