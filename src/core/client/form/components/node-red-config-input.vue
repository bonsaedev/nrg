<template>
  <div style="display: flex; flex-direction: column; width: 100%">
    <slot name="label">
      <NodeRedInputLabel
        v-if="label"
        :label="label"
        :icon="icon"
        :required="required"
      />
    </slot>
    <input :id="inputId" type="text" style="width: 100%" />
    <div v-if="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
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
    type: {
      type: String,
      required: true,
    },
    node: {
      type: Object as () => NodeRED.BaseNode,
      required: true,
    },
    propName: {
      type: String,
      required: true,
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
  emits: ["update:modelValue", "update:value"],
  computed: {
    inputId() {
      return "node-input-" + this.propName;
    },
    effectiveValue(): string {
      return this.modelValue !== undefined ? this.modelValue : this.value;
    },
  },
  mounted() {
    RED.editor.prepareConfigNodeSelect(
      this.node,
      this.propName,
      this.type,
      "node-input",
    );

    const input = $("#" + this.inputId);
    input.on("change", () => {
      const val = input.val() as string;
      // "_ADD_" is Node-RED's internal placeholder for "Add new..." —
      // treat it as empty so validation catches unset config refs.
      const emitVal = val === "_ADD_" ? "" : val;
      this.$emit("update:modelValue", emitVal);
      this.$emit("update:value", emitVal);
    });

    input.val(this.effectiveValue || "_ADD_");
  },
});
</script>
