<template>
  <div ref="container" class="container">
    <slot name="label">
      <NodeRedInputLabel
        v-if="label"
        :label="label"
        :icon="icon"
        :required="required"
      />
    </slot>
    <div class="editor-wrapper">
      <button
        ref="expand-button"
        class="red-ui-button red-ui-button-small expand-button"
        @click="onClickExpand"
      >
        <i class="fa fa-expand"></i>
      </button>
      <div :id="editorId" ref="editor"></div>
    </div>
    <div v-show="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
    <Teleport v-if="trayElement" :to="trayElement">
      <slot name="tray-footer" />
    </Teleport>
  </div>
</template>

<script lang="ts">
import { defineComponent, shallowRef } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
export default defineComponent({
  components: { NodeRedInputLabel },
  props: {
    modelValue: {
      type: String,
      default: undefined,
    },
    value: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "json",
      validator: function (value: string) {
        const allowedLanguages = [
          "abap",
          "apex",
          "azcli",
          "bat",
          "bicep",
          "cameligo",
          "clojure",
          "coffee",
          "cpp",
          "csharp",
          "csp",
          "css",
          "cypher",
          "dart",
          "dockerfile",
          "ecl",
          "elixir",
          "flow9",
          "freemarker2",
          "fsharp",
          "go",
          "graphql",
          "handlebars",
          "hcl",
          "html",
          "ini",
          "java",
          "javascript",
          "json",
          "julia",
          "kotlin",
          "less",
          "lexon",
          "liquid",
          "lua",
          "m3",
          "markdown",
          "mdx",
          "mips",
          "msdax",
          "mysql",
          "objective-c",
          "pascal",
          "pascaligo",
          "perl",
          "pgsql",
          "php",
          "pla",
          "postiats",
          "powerquery",
          "powershell",
          "protobuf",
          "pub",
          "python",
          "qsharp",
          "r",
          "razor",
          "redis",
          "redshift",
          "restructuredtext",
          "ruby",
          "rust",
          "sb",
          "scala",
          "scheme",
          "scss",
          "shell",
          "solidity",
          "sophia",
          "sparql",
          "sql",
          "st",
          "swift",
          "systemverilog",
          "tcl",
          "twig",
          "typescript",
          "typespec",
          "vb",
          "wgsl",
          "xml",
          "yaml",
        ];
        const isValid = allowedLanguages.includes(value);
        if (!isValid) {
          console.warn(
            `[WARN]: Invalid value for 'type' property: "${value}". ` +
              `Expected one of: ${allowedLanguages.join(", ")}`,
          );
        }
        return isValid;
      },
    },
    label: {
      type: String,
      default: "",
    },
    icon: {
      type: String,
      default: "",
    },
    required: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
      default: "",
    },
  },
  emits: [
    "update:modelValue",
    "update:value",
    "editor-ready",
    "tray-open",
    "tray-close",
  ],
  setup() {
    // shallowRef avoids deep reactivity — Monaco editor breaks with Vue proxies.
    // data() + markRaw() was tested and does not work because the reactive
    // setter still intercepts assignments. shallowRef only tracks .value
    // reassignment without proxying the value itself.
    return {
      // NOTE: must not be named "editor" — the template's ref="editor" would
      // overwrite this with the DOM element on every re-render.
      editorInstance: shallowRef<any>(null),
      expandedEditorTray: shallowRef<any>(null),
    };
  },
  data() {
    const stateId = Math.random().toString(36).substring(2, 9);
    return {
      editorId: "node-red-editor-" + stateId,
      stateId,
      trayElement: null as HTMLElement | null,
    };
  },
  computed: {
    effectiveValue(): string {
      return this.modelValue !== undefined ? this.modelValue : this.value;
    },
  },
  mounted() {
    // NOTE: jquery wrapper is used because RED.popover.tooltip needs it
    const expandButton = $(this.$refs["expand-button"] as HTMLElement);
    RED.popover.tooltip(expandButton, RED._("node-red:common.label.expand"));
    this.mountEditor();
    this.createExpandeEditorTray();
  },
  beforeUnmount() {
    if (this.editorInstance) {
      try {
        this.editorInstance.destroy();
      } catch (err) {
        console.error(`Error destroying editor for ID ${this.editorId}:`, err);
      }
      this.editorInstance = null;
    }
  },
  methods: {
    mountEditor() {
      this.$nextTick(() => {
        const containerEl = this.$refs.container as HTMLElement | undefined;
        const editorEl = this.$refs.editor as HTMLElement | undefined;

        if (containerEl && editorEl) {
          try {
            const inlineHeight = containerEl.style.height;
            const inlineWidth = containerEl.style.width;
            if (inlineHeight) {
              editorEl.style.height = inlineHeight;
            } else {
              editorEl.style.height = "200px";
            }

            if (inlineWidth) {
              editorEl.style.width = inlineWidth;
            } else {
              editorEl.style.width = "100%";
            }

            this.createEditorInstance();
          } catch (e) {
            console.error(
              "[NodeRedEditorInput] Error setting initial editor style:",
              e,
            );
            this.createEditorInstance();
          }
        } else {
          console.error(
            "[NodeRedEditorInput] Container or Editor div refs not found on mount.",
          );
        }
      });
    },
    createEditorInstance() {
      this.editorInstance = RED.editor.createEditor({
        id: this.editorId,
        mode: this.language,
        value: this.effectiveValue,
      });
      this.editorInstance.getSession().on("change", () => {
        const currentValue = this.editorInstance.getValue();
        if (currentValue !== this.effectiveValue) {
          this.$emit("update:modelValue", currentValue);
          this.$emit("update:value", currentValue);
        }
      });
      this.$emit("editor-ready", this.editorInstance);
    },
    createExpandeEditorTray() {
      let expandedEditor: any;

      const onCancel = () => {
        setTimeout(() => {
          this.editorInstance.focus();
        }, 250);
        RED.tray.close();
      };

      const onDone = () => {
        expandedEditor.saveView();
        this.editorInstance.setValue(expandedEditor.getValue(), -1);
        setTimeout(() => {
          this.editorInstance.restoreView();
          this.editorInstance.focus();
        }, 250);
        RED.tray.close();
      };

      this.expandedEditorTray = {
        title: "Editor",
        focusElement: true,
        width: "Infinity",
        buttons: [
          {
            id: "node-dialog-cancel",
            text: RED._("common.label.cancel"),
            click: onCancel,
          },
          {
            id: "node-dialog-ok",
            text: RED._("common.label.done"),
            class: "primary",
            click: onDone,
          },
        ],
        open: (tray) => {
          const dialogForm = $(
            '<form id="dialog-form" class="form-horizontal" autocomplete="off"></form>',
          ).appendTo(tray.find(".red-ui-tray-body"));
          dialogForm.html(
            '<div id="expanded-editor-input" style="height: 100%"></div>',
          );

          expandedEditor = RED.editor.createEditor({
            id: "expanded-editor-input",
            stateId: this.stateId,
            mode: this.language,
            focus: true,
            value: this.effectiveValue,
          });
          dialogForm.i18n();
          const trayBody = tray.find(".red-ui-tray-body")[0];
          const footerContainer = document.createElement("div");
          footerContainer.className = "red-ui-tray-footer";
          trayBody.insertAdjacentElement("afterend", footerContainer);
          this.trayElement = footerContainer;
          this.$emit("tray-open", this.trayElement);
        },
        close: () => {
          this.$emit("tray-close");
          if (this.trayElement) {
            this.trayElement.remove();
            this.trayElement = null;
          }
          expandedEditor.destroy();
        },
      };
    },
    onClickExpand() {
      RED.tray.show(this.expandedEditorTray);
    },
  },
});
</script>
<style scoped>
.editor-wrapper {
  position: relative;
}

.expand-button {
  position: absolute;
  top: -23px;
  right: 0px;
  z-index: 10;
  transition: color 0.3s ease;
  cursor: pointer;
}
</style>
