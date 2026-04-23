<template>
  <div style="display: flex; flex-direction: column; width: 100%">
    <input :id="inputId" type="text" style="width: 100%" />
    <div v-if="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
export default defineComponent({
  props: {
    value: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      required: true,
    },
    node: {
      type: Object,
      required: true,
    },
    propName: {
      type: String,
      required: true,
    },
    error: {
      type: String,
      default: "",
    },
  },
  emits: ["update:value"],
  computed: {
    inputId() {
      return "node-input-" + this.propName;
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
      this.$emit("update:value", input.val());
    });

    input.val(this.value || "_ADD_");
  },
});
</script>
