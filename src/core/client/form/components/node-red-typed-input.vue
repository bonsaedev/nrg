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
      ref="typedInput"
      type="text"
      class="node-red-typed-input"
      style="flex: 1; width: 100%"
    />
    <div v-if="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
import { TYPED_INPUT_TYPES } from "../../../constants";

export default defineComponent({
  components: { NodeRedInputLabel },
  props: {
    modelValue: {
      type: Object,
      default: undefined,
      validator: function (obj: { value: string; type: string } | undefined) {
        if (obj === undefined) return true;
        if (typeof obj !== "object" || obj === null) return false;
        return typeof obj.value === "string" && typeof obj.type === "string";
      },
    },
    value: {
      type: Object,
      default: undefined,
      validator: function (obj: { value: string; type: string } | undefined) {
        if (obj === undefined) return true;
        if (typeof obj !== "object" || obj === null) {
          console.warn(
            "[WARN] Invalid value for 'value' property. It must be an object.",
          );
          return false;
        }
        const isValid =
          typeof obj.value === "string" && typeof obj.type === "string";
        if (!isValid) {
          console.warn(
            "[WARN] Invalid value for 'value' property. It must be an object with 'value' and 'type' properties being strings.",
            obj,
          );
        }
        return isValid;
      },
    },
    types: {
      type: Array as PropType<
        (NodeRED.DefaultTypedInputType | NodeRED.TypedInputTypeDefinition)[]
      >,
      default: () => TYPED_INPUT_TYPES,
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
  // $input and mutationObserver are assigned directly on `this` in mounted().
  // They must NOT be in data() because Vue's reactivity proxy breaks jQuery
  // widgets. markRaw() was tested and also does not work.
  computed: {
    effectiveValue(): { value: string; type: string } {
      return this.modelValue !== undefined ? this.modelValue : this.value;
    },
    isProvidedValueTypeValid() {
      const type = this.effectiveValue.type;
      const types = this.types;

      return types.includes(type);
    },
  },
  watch: {
    isProvidedValueTypeValid: {
      handler(newValue) {
        if (!newValue) {
          console.warn(
            `Validation failed: this.value.type (${this.value.type}) must be one of the provided types (${this.types}).`,
          );
        }
      },
      immediate: true,
    },
    error(newVal) {
      this.$nextTick(() => {
        const targetDiv = this.$el.querySelector(
          ".red-ui-typedInput-container",
        );
        if (newVal) {
          targetDiv.classList.add("input-error");
        } else {
          targetDiv.classList.remove("input-error");
        }
      });
    },
  },
  mounted() {
    const inputElement = this.$refs.typedInput;
    this.$input = $(inputElement).typedInput({
      default: this.effectiveValue.type || this.types[0],
      types: this.types,
    });

    this.$input.typedInput("value", this.effectiveValue.value || "");
    this.$input.typedInput("type", this.effectiveValue.type || this.types[0]);

    // NOTE: when typed input is just a text input, it isn't emiting change while typing because it is updating the value in a hidden input
    this.$nextTick(() => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.attributeName === "value") {
            this.onChange();
          }
        }
      });

      observer.observe(inputElement, {
        attributes: true,
        attributeFilter: ["value"],
      });

      this.mutationObserver = observer;
    });

    // NOTE: this emits changes to all types that lose focus when choosing a value, but text inputs
    this.$input.on("change", () => {
      this.onChange();
    });
  },
  beforeUnmount() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  },
  methods: {
    onChange() {
      const newValue = this.$input.typedInput("value");
      const newType = this.$input.typedInput("type");
      if (
        this.effectiveValue.value !== newValue ||
        this.effectiveValue.type !== newType
      ) {
        const payload = { value: newValue, type: newType };
        this.$emit("update:modelValue", payload);
        this.$emit("update:value", payload);
      }
    },
  },
});
</script>
