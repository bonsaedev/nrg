<template>
  <!-- Renders nothing inline. While open, the default slot is TELEPORTED into the
       Node-RED tray body, so the tray's content is a real Vue subtree the node
       author controls — no imperative DOM/jQuery. RED owns the tray shell (title
       + footer buttons) via RED.tray.show. -->
  <Teleport v-if="trayBody" :to="trayBody">
    <div class="nrg-tray-content">
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/**
 * A reusable Node-RED tray, driven by Vue — for node authors building custom
 * form components. Put your content in the default slot and open it via a ref:
 *
 * ```vue
 * <template>
 *   <button type="button" @click="$refs.tray.open()">Edit…</button>
 *   <NodeRedTray ref="tray" title="My editor" @done="save">
 *     <MyEditor v-model="draft" />
 *   </NodeRedTray>
 * </template>
 * ```
 *
 * The default footer has Cancel and Done buttons that emit `cancel` / `done`
 * (and close the tray). `open` / `close` fire on show/hide. The slot receives a
 * `close` helper for closing from within.
 */
export default defineComponent({
  name: "NodeRedTray",
  props: {
    /** Tray title shown in the header. */
    title: { type: String, default: "" },
    /** Tray width — a pixel number, a CSS width, or "Infinity" (full). */
    width: { type: String, default: "Infinity" },
  },
  emits: ["open", "close", "done", "cancel"],
  data() {
    return { trayBody: null as HTMLElement | null };
  },
  methods: {
    /** Show the tray; the default slot renders into the tray body. */
    open() {
      RED.tray.show({
        title: this.title,
        width: this.width,
        buttons: [
          {
            id: "node-dialog-cancel",
            text: RED._("common.label.cancel"),
            click: () => {
              this.$emit("cancel");
              RED.tray.close();
            },
          },
          {
            id: "node-dialog-ok",
            text: RED._("common.label.done"),
            class: "primary",
            click: () => {
              this.$emit("done");
              RED.tray.close();
            },
          },
        ],
        open: (tray: JQuery) => {
          this.trayBody = tray.find(".red-ui-tray-body")[0] ?? null;
          this.$emit("open");
        },
        close: () => {
          this.trayBody = null;
          this.$emit("close");
        },
      });
    },
    /** Close the tray programmatically. */
    close() {
      RED.tray.close();
    },
  },
});
</script>

<style scoped>
.nrg-tray-content {
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
}
</style>
