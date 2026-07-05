<template>
  <!-- Nothing renders inline. When a tray is open, the editor is TELEPORTED into
       the RED tray body, so the tray's content is a real Vue subtree (the Monaco
       editor component) rather than imperively-built jQuery DOM. RED still owns
       the tray shell (title/buttons) via RED.tray.show. -->
  <Teleport v-if="trayBody" :to="trayBody">
    <div class="nrg-schema-tray">
      <NodeRedEditorInput
        :model-value="draft"
        language="json"
        @update:model-value="(v: string) => (draft = v)"
      />
    </div>
  </Teleport>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import NodeRedEditorInput from "./node-red-editor-input.vue";

/**
 * A JSON-schema editor rendered inside a Node-RED tray, driven by Vue. Open it
 * imperatively via a ref: `tray.open(title, value, onSave)`. The Monaco editor is
 * the {@link NodeRedEditorInput} Vue component, teleported into the tray body;
 * Done reads the current draft and hands it to `onSave`.
 */
export default defineComponent({
  name: "NodeRedSchemaTray",
  components: { NodeRedEditorInput },
  data() {
    return {
      trayBody: null as HTMLElement | null,
      draft: "",
      onSave: null as ((value: string) => void) | null,
    };
  },
  methods: {
    open(title: string, value: string, onSave: (value: string) => void) {
      this.draft = value;
      this.onSave = onSave;
      RED.tray.show({
        title,
        width: "Infinity",
        buttons: [
          {
            id: "node-dialog-cancel",
            text: RED._("common.label.cancel"),
            click: () => RED.tray.close(),
          },
          {
            id: "node-dialog-ok",
            text: RED._("common.label.done"),
            class: "primary",
            click: () => {
              this.onSave?.(this.draft);
              RED.tray.close();
            },
          },
        ],
        open: (tray: JQuery) => {
          this.trayBody = tray.find(".red-ui-tray-body")[0] ?? null;
        },
        close: () => {
          this.trayBody = null;
          this.onSave = null;
        },
      });
    },
  },
});
</script>

<style scoped>
.nrg-schema-tray {
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
}
.nrg-schema-tray :deep(.container),
.nrg-schema-tray :deep(.editor-wrapper) {
  height: 100%;
}
</style>
