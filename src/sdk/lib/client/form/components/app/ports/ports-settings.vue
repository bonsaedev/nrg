<template>
  <div v-if="showPortsSettings" class="nrg-section">
    <div class="nrg-section-title">
      {{ resolveLabel("portSettings.title", "Ports Settings") }}
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
  /* Scroll the table horizontally when it can't fit the editor's default width,
     instead of forcing the tray wider. */
  overflow-x: auto;
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
  /* All three tables share one full-width fixed layout. Every column has an
     explicit width, so the table's max-content is BOUNDED — otherwise the
     widthless Description column would report its full text and Node-RED would
     size the edit tray to it. The minimum keeps controls from squeezing; if the
     editor is narrower, the .nrg-subsection wrapper scrolls. */
  width: 100%;
  min-width: 360px;
  table-layout: fixed;
  margin-top: 6px;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--red-ui-secondary-border-color, #d9d9d9);
  border-radius: 3px;
  overflow: hidden;
  font-size: 12px;
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
  white-space: nowrap;
}

/* Fixed Label column — long labels truncate with an ellipsis instead of
   widening the table. */
:deep(.nrg-cell-label) {
  width: 84px;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Fixed control column, wide enough to keep the "Validate Data" / "Data Schema"
   headers on one line. */
:deep(.nrg-cell-flag) {
  width: 100px;
  white-space: nowrap;
}

/* Description column — a FIXED width (not "remaining"), so the fixed-layout table
   has a bounded max-content and Node-RED opens the tray at its default size.
   Left-aligned, muted, and wraps within the column. */
:deep(.nrg-cell-desc) {
  width: 200px;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--red-ui-text-color-disabled, #999);
  font-size: 11px;
}

/* Center the toggle in the cell. Block-level `flex` (not the component's default
   inline-flex) so the cell's `vertical-align: middle` centers it on the row's
   true center, not the text x-height — otherwise the toggle sits slightly high
   relative to the taller schema button in the same row. */
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

/* A comfortable 28px schema-button height, scoped through the flag cell to beat
   Node-RED's global `.red-ui-button-small` height (20px). */
:deep(.nrg-cell-flag .nrg-schema-btn) {
  height: 28px;
  box-sizing: border-box;
  border-radius: 5px;
}
</style>
