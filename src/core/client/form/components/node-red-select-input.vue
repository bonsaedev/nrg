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
    <input
      ref="selectInput"
      type="text"
      class="node-input-select"
      style="width: 100%"
    />
    <div v-if="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
export default defineComponent({
  components: { NodeRedInputLabel },
  props: {
    value: {
      type: [String, Array],
      default: () => "",
    },
    options: {
      type: Array as PropType<Array<{ value: string; label: string }>>,
      required: true,
      validator: function (value: Array<{ value: string; label: string }>) {
        if (!Array.isArray(value)) {
          console.warn(
            "[WARN] Invalid value for 'options' property. It must be an array.",
          );
          return false;
        }
        const isValid = value.every(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            typeof item.value === "string" &&
            typeof item.label === "string" &&
            Object.prototype.hasOwnProperty.call(item, "value") &&
            Object.prototype.hasOwnProperty.call(item, "label"),
        );

        if (!isValid) {
          console.warn(
            "[WARN] Invalid value for 'options' property. Each item must be an object with 'value' and 'label' properties being strings.",
            value,
          );
        }
        return isValid;
      },
    },
    multiple: {
      type: Boolean,
      default: false,
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
  emits: ["update:value"],
  mounted() {
    const inputElement = this.$refs.selectInput as HTMLInputElement;
    const $selectInput = $(inputElement);
    $selectInput.typedInput({
      types: [
        {
          multiple: this.multiple,
          options: this.options,
        },
      ],
    });

    $selectInput.typedInput(
      "value",
      Array.isArray(this.value) ? this.value.join(",") : this.value,
    );
    $selectInput.on("change", () => {
      const newValue = this.multiple
        ? ($selectInput.typedInput("value")?.split(",").filter(Boolean) ?? [])
        : $selectInput.typedInput("value");
      this.$emit("update:value", newValue);
    });
  },
});
</script>
