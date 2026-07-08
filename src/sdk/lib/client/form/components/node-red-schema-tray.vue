<template>
  <!-- The per-port schema editor, built ON TOP of the reusable NodeRedTray: a
       Monaco (JSON) editor as the tray's Vue content. This is how a node author
       composes NodeRedTray with their own content. -->
  <NodeRedTray ref="tray" :title="title" @done="onDone">
    <div class="nrg-schema-tray">
      <NodeRedEditorInput
        class="nrg-schema-editor"
        :model-value="draft"
        language="json"
        :editor-options="editorOptions"
        @update:model-value="(v: string) => (draft = v)"
      />
      <!-- Live validation of the schema as it is typed: the same check the
           runtime runs, so a malformed schema is caught here in the tray, not
           at deploy. Empty/valid → no message. -->
      <div v-if="schemaError" class="nrg-schema-tray-error" role="alert">
        <span class="nrg-schema-tray-error-icon" aria-hidden="true">⚠</span>
        <span>{{ schemaError }}</span>
      </div>
    </div>
  </NodeRedTray>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { editor as MonacoEditor } from "monaco-editor";
import NodeRedTray from "./node-red-tray.vue";
import NodeRedEditorInput from "./node-red-editor-input.vue";
import { validateSchemaString } from "../../validation";

/**
 * A JSON-schema editor in a Node-RED tray. Open it via a ref:
 * `tray.open(title, value, onSave)` — `onSave` receives the edited value on Done.
 */
export default defineComponent({
  name: "NodeRedSchemaTray",
  components: { NodeRedTray, NodeRedEditorInput },
  data() {
    return {
      title: "",
      draft: "",
      onSave: null as ((value: string) => void) | null,
      // Monaco options for the schema editor. Line numbers make the validation
      // error's "line X column Y" actionable; the minimap aids navigation of
      // larger schemas.
      editorOptions: {
        lineNumbers: "on",
        minimap: { enabled: true },
      } as MonacoEditor.IStandaloneEditorConstructionOptions,
    };
  },
  computed: {
    /** Live error for the current draft — `null` when empty or valid. */
    schemaError(): string | null {
      return validateSchemaString(this.draft);
    },
  },
  methods: {
    open(title: string, value: string, onSave: (value: string) => void) {
      this.title = title;
      this.draft = value;
      this.onSave = onSave;
      (this.$refs.tray as { open(): void }).open();
    },
    onDone() {
      this.onSave?.(this.draft);
    },
  },
});
</script>

<style scoped>
.nrg-schema-tray {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.nrg-schema-editor {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
}
.nrg-schema-editor :deep(.container),
.nrg-schema-editor :deep(.editor-wrapper) {
  height: 100%;
}

/* Live schema error, pinned below the editor. Uses the Node-RED error color
   with a subtle red-tinted background so it reads as a validation failure. */
.nrg-schema-tray-error {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 10px;
  color: var(--red-ui-text-color-error, #d33);
  background: rgba(211, 51, 51, 0.08);
  border: 1px solid var(--red-ui-text-color-error, #d33);
  border-radius: 3px;
  font-size: 13px;
  line-height: 1.4;
}
.nrg-schema-tray-error-icon {
  font-weight: 700;
}
</style>
