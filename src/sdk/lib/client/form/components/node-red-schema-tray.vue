<template>
  <!-- The per-port schema editor, built ON TOP of the reusable NodeRedTray: a
       Monaco (JSON) editor as the tray's Vue content. This is how a node author
       composes NodeRedTray with their own content. -->
  <NodeRedTray ref="tray" :title="title" @done="onDone">
    <NodeRedEditorInput
      class="nrg-schema-editor"
      :model-value="draft"
      language="json"
      @update:model-value="(v: string) => (draft = v)"
    />
  </NodeRedTray>
</template>

<script lang="ts">
import { defineComponent } from "vue";
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
    };
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
.nrg-schema-editor {
  display: block;
  height: 100%;
}
.nrg-schema-editor :deep(.container),
.nrg-schema-editor :deep(.editor-wrapper) {
  height: 100%;
}
</style>
