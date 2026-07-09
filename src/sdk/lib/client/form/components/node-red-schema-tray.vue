<template>
  <!-- The per-port schema editor, built ON TOP of the reusable NodeRedTray: a
       Monaco (JSON) editor as the tray's Vue content. This is how a node author
       composes NodeRedTray with their own content. -->
  <NodeRedTray ref="tray" :title="title" @done="onDone">
    <div class="nrg-schema-tray">
      <!-- Already inside a tray, so no expand button; fills the tray height.
           Monaco's own inline (intellisense) diagnostics surface JSON errors —
           no separate error message is rendered here. -->
      <NodeRedEditorInput
        class="nrg-schema-editor"
        :model-value="draft"
        language="json"
        :expandable="false"
        fill
        :editor-options="editorOptions"
        @update:model-value="(v: string) => (draft = v)"
      />
    </div>
  </NodeRedTray>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { editor as MonacoEditor } from "monaco-editor";
import NodeRedTray from "./node-red-tray.vue";
import NodeRedEditorInput from "./node-red-editor-input.vue";

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
      // Monaco options for the schema editor. Line numbers make Monaco's
      // "line X column Y" diagnostics actionable; the minimap aids navigation of
      // larger schemas; automaticLayout keeps it sized to the (filled) tray.
      editorOptions: {
        lineNumbers: "on",
        minimap: { enabled: true },
        automaticLayout: true,
      } as MonacoEditor.IStandaloneEditorConstructionOptions,
    };
  },
  methods: {
    open(title: string, value: string, onSave: (value: string) => void) {
      this.title = title;
      this.draft = value;
      this.onSave = onSave;
      // Pass the title through so RED.tray.show gets it now, not on the next
      // reactive tick (the `:title` prop hasn't propagated to NodeRedTray yet).
      (this.$refs.tray as { open(title?: string): void }).open(title);
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
</style>
