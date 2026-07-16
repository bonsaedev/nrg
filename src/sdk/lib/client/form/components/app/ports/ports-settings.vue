<template>
  <div v-if="showPortsSettings" class="nrg-section">
    <div class="nrg-section-title">
      {{ resolveLabel("sections.portsSettings", "Ports Settings") }}
    </div>
    <JsonSchemaLogo />
    <InputSettings v-if="features.hasInput" />
    <OutputsSettings v-if="showOutputs" />
    <LifecyclePortsSettings v-if="hasBuiltinPorts" />
  </div>
</template>

<script setup lang="ts">
import { usePortsSettings } from "../../../composables/use-ports-settings";
import JsonSchemaLogo from "./json-schema-logo.vue";
import InputSettings from "./input-settings.vue";
import OutputsSettings from "./outputs-settings.vue";
import LifecyclePortsSettings from "./lifecycle-ports-settings.vue";

const {
  showPortsSettings,
  features,
  showOutputs,
  hasBuiltinPorts,
  resolveLabel,
} = usePortsSettings();
</script>

<style scoped>
/* Per-column explanations below the input/outputs tables (replaces the old
   per-row Description column — one dash item per column that takes user input). */
:deep(.nrg-help-list) {
  margin: 4px 0 6px;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--red-ui-text-color-disabled, #999);
}

:deep(.nrg-help-list li) {
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

:deep(.nrg-help-link) {
  color: var(--red-ui-text-color-link, #2196f3);
  white-space: nowrap;
}

:deep(.nrg-help-link:hover) {
  text-decoration: underline;
}

:deep(.nrg-subsection) {
  margin-bottom: 10px;
}

:deep(.nrg-subsection-title) {
  font-weight: bold;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--red-ui-text-color-disabled, #777);
  margin: 6px 0 4px;
}

:deep(.nrg-outputs),
:deep(.nrg-lifecycle),
:deep(.nrg-input) {
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
:deep(.nrg-lifecycle),
:deep(.nrg-input) {
  table-layout: auto;
}

/* The Input table holds just Label + Validate Data (+ Validate Types), so unlike
   the Outputs table it needn't span the panel — size it to its content. Declared
   after the shared `width: 100%` so it wins. */
:deep(.nrg-input) {
  width: auto;
}

:deep(.nrg-lifecycle .nrg-cell-flag),
:deep(.nrg-input .nrg-cell-flag) {
  width: auto;
}

:deep(.nrg-outputs th),
:deep(.nrg-outputs td),
:deep(.nrg-lifecycle th),
:deep(.nrg-lifecycle td),
:deep(.nrg-input th),
:deep(.nrg-input td) {
  padding: 5px 8px;
  text-align: center;
  vertical-align: middle;
  border-right: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
  border-bottom: 1px solid var(--red-ui-secondary-border-color, #e6e6e6);
}

:deep(.nrg-outputs th:last-child),
:deep(.nrg-outputs td:last-child),
:deep(.nrg-lifecycle th:last-child),
:deep(.nrg-lifecycle td:last-child),
:deep(.nrg-input th:last-child),
:deep(.nrg-input td:last-child) {
  border-right: none;
}

:deep(.nrg-outputs tbody tr:last-child td),
:deep(.nrg-lifecycle tbody tr:last-child td),
:deep(.nrg-input tbody tr:last-child td) {
  border-bottom: none;
}

:deep(.nrg-outputs thead th),
:deep(.nrg-lifecycle thead th),
:deep(.nrg-input thead th) {
  background: var(--red-ui-tertiary-background, #f3f3f3);
  color: var(--red-ui-text-color-disabled, #777);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* Fixed Label column — long labels truncate with an ellipsis instead of
   widening the table. */
:deep(.nrg-cell-label) {
  width: 200px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.nrg-cell-flag) {
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
:deep(.nrg-cell-flag .nrg-toggle-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Center the logo in the button (an icon-only button; flex avoids the inline
   baseline offset). */
:deep(.nrg-schema-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
:deep(.nrg-schema-btn .nrg-schema-glyph) {
  display: inline-flex;
  align-items: center;
  line-height: 0;
  /* No color set: `currentColor` inherits the Node-RED button font color. The
     error rule below overrides it to red. */
}
:deep(.nrg-schema-btn .nrg-schema-glyph svg) {
  display: block;
  height: 14px;
  width: auto;
}

/* Invalid flow-author schema: redden the logo and border so the mistake is
   visible on the button without opening the tray. */
:deep(.nrg-schema-btn.nrg-schema-btn-error) {
  border-color: var(--red-ui-text-color-error, #d33);
}
:deep(.nrg-schema-btn.nrg-schema-btn-error .nrg-schema-glyph) {
  color: var(--red-ui-text-color-error, #d33);
}

/* Match the return-property / context-mode field height (28px), scoped through
   the flag cell to beat Node-RED's global `.red-ui-button-small` height (20px). */
:deep(.nrg-cell-flag .nrg-schema-btn) {
  height: 28px;
  box-sizing: border-box;
  border-radius: 5px;
}

/* Keep column headers (notably "Validate Data") on a single line. */
:deep(.nrg-input thead th),
:deep(.nrg-outputs thead th) {
  white-space: nowrap;
}
</style>
