<template>
  <!-- Outputs -->
  <div class="nrg-subsection">
    <div class="nrg-subsection-title">
      {{ resolveLabel("portSettings.outputsTable.section", "Outputs") }}
    </div>
    <div class="nrg-table-scroll">
      <table class="nrg-outputs">
        <thead>
          <tr>
            <th class="nrg-cell-label">
              {{ resolveLabel("portSettings.outputsTable.label", "Label") }}
            </th>
            <th v-if="hasOutputValidation" class="nrg-cell-flag">
              {{
                resolveLabel(
                  "portSettings.outputsTable.validate",
                  "Validate Data",
                )
              }}
            </th>
            <th v-if="hasOutputSchemas" class="nrg-cell-flag">
              {{
                resolveLabel("portSettings.outputsTable.schema", "Data Schema")
              }}
            </th>
            <th class="nrg-cell-desc">
              {{
                resolveLabel(
                  "portSettings.outputsTable.description",
                  "Description",
                )
              }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="port in outputRows" :key="port.index">
            <td class="nrg-cell-label">{{ port.label }}</td>
            <td v-if="hasOutputValidation" class="nrg-cell-flag">
              <NodeRedToggle
                :model-value="validateOutputFor(port.index)"
                :aria-label="`${resolveLabel('portSettings.outputsTable.validate', 'Validate Data')} — ${port.label}`"
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
                :aria-label="`${resolveLabel('portSettings.outputsTable.schema', 'Data Schema')} — ${port.label}`"
                @click="openOutputSchemaEditor(port.index)"
              >
                <span class="nrg-schema-glyph" aria-hidden="true">
                  <svg viewBox="0 0 256 220">
                    <use href="#nrg-json-schema-logo" />
                  </svg>
                </span>
              </button>
            </td>
            <td class="nrg-cell-desc">{{ port.description }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="nrg-help-list">
      <li>
        <strong>{{
          resolveLabel("portSettings.outputsTable.validate", "Validate Data")
        }}</strong>
        —
        {{
          resolveLabel(
            "portSettings.outputsTable.help.validate",
            "Check the sent value against this port's schema before it is emitted.",
          )
        }}
        <a
          class="nrg-help-link"
          :href="docsUrl('/guide/schemas#output-schema')"
          target="_blank"
          rel="noopener noreferrer"
          >{{
            resolveLabel(
              "portSettings.outputsTable.help.learnMore",
              "Learn more",
            )
          }}</a
        >
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { usePortsSettings } from "../../../composables/use-ports-settings";

const {
  errors,
  hasOutputValidation,
  hasOutputSchemas,
  outputRows,
  resolveLabel,
  docsUrl,
  validateOutputFor,
  setValidateOutput,
  openOutputSchemaEditor,
} = usePortsSettings();
</script>

<style scoped></style>
