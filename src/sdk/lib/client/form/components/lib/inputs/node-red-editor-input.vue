<template>
  <div ref="container" class="container">
    <slot name="label">
      <NodeRedInputLabel
        v-if="label"
        :label="label"
        :icon="icon"
        :required="required"
        :label-id="labelId || undefined"
      />
    </slot>
    <div class="editor-wrapper">
      <button
        v-if="expandable"
        ref="expand-button"
        class="red-ui-button red-ui-button-small expand-button"
        @click="onClickExpand"
      >
        <i class="fa fa-expand"></i>
      </button>
      <div
        :id="editorId"
        ref="editor"
        role="textbox"
        :aria-labelledby="labelId || undefined"
      ></div>
    </div>
    <div v-if="help" class="node-red-vue-input-help-message">{{ help }}</div>
    <div v-show="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
    <!-- "Expand" pops the field's editor into a full-width tray. Reuses the
         shared NodeRedTray shell; a second Monaco is mounted into the teleported
         host (sharing this field's stateId for scroll/cursor view state).
         Skipped when the editor is already inside a tray (`expandable=false`). -->
    <NodeRedTray
      v-if="expandable"
      ref="expandTray"
      title="Editor"
      @open="onExpandOpen"
      @done="onExpandDone"
      @cancel="onExpandCancel"
      @close="onExpandClose"
    >
      <div :id="expandedEditorId" class="expanded-editor-host"></div>
    </NodeRedTray>
  </div>
</template>

<script lang="ts">
import type { PropType } from "vue";
import type { editor as MonacoEditor } from "monaco-editor";
import { defineComponent, shallowRef } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
import NodeRedTray from "../node-red-tray.vue";
export default defineComponent({
  components: { NodeRedInputLabel, NodeRedTray },
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
    /** A help note rendered under the input, above the error message. */
    help: {
      type: String,
      default: "",
    },
    /** id of the label; the ACE editor region references it via
     *  `aria-labelledby` (it's a `<div>`, not a labelable control). */
    labelId: {
      type: String,
      default: "",
    },
    /** Show the "expand into a tray" button. Turn off when the editor is
     *  already mounted inside a tray (the button would be redundant). */
    expandable: {
      type: Boolean,
      default: true,
    },
    /** Fill the parent's height (height: 100%) instead of the fixed 200px —
     *  for use inside a tray/flex container that supplies the height. */
    fill: {
      type: Boolean,
      default: false,
    },
    /**
     * Monaco editor construction options (e.g. `{ lineNumbers: "on",
     * minimap: { enabled: true } }`), forwarded verbatim to
     * `RED.editor.createEditor`. Public and unopinionated: nrg sets no default,
     * so the consuming component controls the editor's behaviour entirely.
     */
    editorOptions: {
      type: Object as PropType<MonacoEditor.IStandaloneEditorConstructionOptions>,
      default: undefined,
    },
  },
  emits: ["update:modelValue", "update:value", "editor-ready"],
  setup() {
    // shallowRef avoids deep reactivity — Monaco editor breaks with Vue proxies.
    // data() + markRaw() was tested and does not work because the reactive
    // setter still intercepts assignments. shallowRef only tracks .value
    // reassignment without proxying the value itself.
    return {
      // NOTE: must not be named "editor" — the template's ref="editor" would
      // overwrite this with the DOM element on every re-render.
      editorInstance: shallowRef<any>(null),
      // The second Monaco created inside the expand tray while it's open.
      expandedEditor: shallowRef<any>(null),
    };
  },
  data() {
    const stateId = Math.random().toString(36).substring(2, 9);
    return {
      editorId: "node-red-editor-" + stateId,
      expandedEditorId: "expanded-editor-" + stateId,
      stateId,
    };
  },
  computed: {
    effectiveValue(): string {
      return this.modelValue !== undefined ? this.modelValue : this.value;
    },
  },
  mounted() {
    if (this.expandable) {
      // NOTE: jquery wrapper is used because RED.popover.tooltip needs it
      const expandButton = $(this.$refs["expand-button"] as HTMLElement);
      RED.popover.tooltip(expandButton, RED._("node-red:common.label.expand"));
    }
    this.mountEditor();
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
    // The tray is normally torn down before the field unmounts, but guard the
    // expanded editor in case the whole form is destroyed while it's open.
    this.destroyExpandedEditor();
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
            if (this.fill) {
              // Fill the tray/flex parent that supplies the height.
              editorEl.style.height = "100%";
            } else if (inlineHeight) {
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
        options: this.editorOptions,
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
    destroyExpandedEditor() {
      if (this.expandedEditor) {
        try {
          this.expandedEditor.destroy();
        } catch {
          // already destroyed with its container — nothing to clean up
        }
        this.expandedEditor = null;
      }
    },
    onClickExpand() {
      (this.$refs.expandTray as { open(): void }).open();
    },
    // The tray body exists once NodeRedTray emits `open`; the teleported host
    // div renders on the next tick, so create the expanded editor then. It
    // shares this field's stateId so scroll/cursor position carries over.
    onExpandOpen() {
      this.$nextTick(() => {
        this.expandedEditor = RED.editor.createEditor({
          id: this.expandedEditorId,
          stateId: this.stateId,
          mode: this.language,
          value: this.effectiveValue,
          options: this.editorOptions,
        });
        this.expandedEditor.focus?.();
      });
    },
    onExpandDone() {
      this.expandedEditor.saveView();
      this.editorInstance?.setValue(this.expandedEditor.getValue(), -1);
      // the inline editor can be destroyed before this deferred restore fires
      setTimeout(() => {
        this.editorInstance?.restoreView();
        this.editorInstance?.focus();
      }, 250);
    },
    onExpandCancel() {
      // the inline editor can be destroyed (form closed) before this fires
      setTimeout(() => {
        this.editorInstance?.focus();
      }, 250);
    },
    onExpandClose() {
      this.destroyExpandedEditor();
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

/* The expanded editor fills the tray body (NodeRedTray pads its content). */
.expanded-editor-host {
  height: 100%;
}
</style>
