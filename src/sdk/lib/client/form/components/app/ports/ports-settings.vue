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
/* Plain help text below each Port Settings table (Input / Outputs / Lifecycle) —
   describes the column(s) that take input. Not a list, so there's no marker. */
:deep(.nrg-help) {
  margin: 6px 0 2px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--red-ui-text-color-disabled, #999);
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

/* The scroll box around each table. `contain: inline-size` sizes it WITHOUT
   looking at the (wide, single-line) table inside, so the table never widens the
   edit tray — the tray opens at its default width and this box scrolls
   horizontally to reach the full descriptions. */
:deep(.nrg-table-scroll) {
  width: 100%;
  contain: inline-size;
  overflow-x: auto;
  margin-top: 6px;
}

:deep(.nrg-outputs),
:deep(.nrg-lifecycle),
:deep(.nrg-input) {
  /* Fill the scroll box. The Label + control columns shrink-wrap to their content
     (see the per-column `width: 1%` rules) and the Description column takes the
     slack (`width: 100%`), so widening the tray grows Description — not the flag
     columns. A long single-line description still exceeds the box (its nowrap
     min-content beats `width: 100%`) and .nrg-table-scroll scrolls to reach it. */
  width: 100%;
  table-layout: auto;
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

/* Label column fits its content (the node/port label), on a single line.
   `width: 1%` + nowrap shrink-wraps it so it never absorbs the tray's extra
   width — that goes to Description instead. */
:deep(.nrg-cell-label) {
  white-space: nowrap;
  width: 1%;
}

/* Control columns (Validate Data / Data Schema / Enable) fit their header +
   control, on a single line. `width: 1%` + nowrap pins them to content so they
   don't stretch as the tray widens. */
:deep(.nrg-cell-flag) {
  white-space: nowrap;
  width: 1%;
}

/* Description column — a single UNWRAPPED line so rows never grow tall. It's the
   flexible column: `width: 100%` makes it absorb the tray's extra width, so
   widening the tray grows Description (not Label / the flag columns). When the
   text runs wider than the tray, the .nrg-table-scroll box scrolls to reach it. */
:deep(.nrg-cell-desc) {
  text-align: left;
  white-space: nowrap;
  width: 100%;
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
