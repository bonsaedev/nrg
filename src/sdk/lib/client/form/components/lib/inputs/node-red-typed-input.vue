<template>
  <div style="display: flex; flex-direction: column; width: 100%">
    <slot name="label">
      <NodeRedInputLabel
        v-if="label"
        :label="label"
        :icon="icon"
        :required="required"
        :label-id="labelId || undefined"
      />
    </slot>
    <input
      ref="typedInput"
      :aria-labelledby="labelId || undefined"
      type="text"
      class="node-red-typed-input"
      style="flex: 1; width: 100%"
    />
    <div v-if="help" class="node-red-vue-input-help-message">{{ help }}</div>
    <div v-if="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, shallowRef, type PropType } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
import { TYPED_INPUT_TYPES } from "../../../../../shared/constants";

export default defineComponent({
  components: { NodeRedInputLabel },
  props: {
    modelValue: {
      type: Object as PropType<{ value: string; type: string } | undefined>,
      default: undefined,
      validator: function (obj: { value: string; type: string } | undefined) {
        if (obj === undefined) return true;
        if (typeof obj !== "object" || obj === null) {
          console.warn(
            "[WARN] Invalid modelValue for TypedInput. It must be an object.",
          );
          return false;
        }
        const isValid =
          typeof obj.value === "string" && typeof obj.type === "string";
        if (!isValid) {
          console.warn(
            "[WARN] Invalid modelValue for TypedInput. It must be an object with 'value' and 'type' properties being strings.",
            obj,
          );
        }
        return isValid;
      },
    },
    value: {
      type: Object as PropType<{ value: string; type: string } | undefined>,
      default: undefined,
      validator: function (obj: { value: string; type: string } | undefined) {
        if (obj === undefined) return true;
        if (typeof obj !== "object" || obj === null) {
          console.warn(
            "[WARN] Invalid value for TypedInput. It must be an object.",
          );
          return false;
        }
        const isValid =
          typeof obj.value === "string" && typeof obj.type === "string";
        if (!isValid) {
          console.warn(
            "[WARN] Invalid value for TypedInput. It must be an object with 'value' and 'type' properties being strings.",
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
    /** A help note rendered under the input, above the error message. */
    help: {
      type: String,
      default: "",
    },
    /** id of the label; the jQuery typedInput widget references it via
     *  `aria-labelledby` (its own id doesn't survive the widget transform). */
    labelId: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue", "update:value"],
  setup() {
    return {
      inputWidget: shallowRef<any>(null),
      mutationObserver: shallowRef<MutationObserver | null>(null),
    };
  },
  computed: {
    effectiveValue(): { value: string; type: string } {
      return (this.modelValue !== undefined ? this.modelValue : this.value) as {
        value: string;
        type: string;
      };
    },
    isProvidedValueTypeValid() {
      const type = this.effectiveValue.type;
      const types = this.types;

      return (types as readonly unknown[]).includes(type);
    },
  },
  watch: {
    isProvidedValueTypeValid: {
      handler(newValue) {
        if (!newValue) {
          console.warn(
            `Validation failed: type (${this.effectiveValue.type}) must be one of the provided types (${this.types}).`,
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
        if (!targetDiv) return;
        if (newVal) {
          targetDiv.classList.add("input-error");
        } else {
          targetDiv.classList.remove("input-error");
        }
      });
    },
    // Push an EXTERNAL value/type change into the jQuery widget (e.g. a custom
    // form updating an interdependent sibling via useFormNode). Two guards keep
    // it safe: skip while focus is inside this widget (don't fight the user), and
    // only write when the widget doesn't already match — so the user's own edit
    // (which round-trips back through onChange) never re-triggers a write, which
    // would otherwise form a feedback loop with the value MutationObserver.
    effectiveValue: {
      handler(newVal: { value: string; type: string }) {
        if (!this.inputWidget) return;
        if (this.$el.contains(document.activeElement)) return;
        if (newVal.value !== this.inputWidget.typedInput("value")) {
          this.inputWidget.typedInput("value", newVal.value ?? "");
        }
        if (newVal.type !== this.inputWidget.typedInput("type")) {
          this.inputWidget.typedInput("type", newVal.type ?? this.types[0]);
        }
      },
      deep: true,
    },
  },
  mounted() {
    const inputElement = this.$refs.typedInput as HTMLElement;
    this.inputWidget = $(inputElement);
    this.inputWidget.typedInput({
      default: this.effectiveValue.type || this.types[0],
      types: this.types,
    });

    this.inputWidget.typedInput("value", this.effectiveValue.value || "");
    this.inputWidget.typedInput(
      "type",
      this.effectiveValue.type || this.types[0],
    );

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
    this.inputWidget.on("change", () => {
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
      const newValue = this.inputWidget.typedInput("value");
      const newType = this.inputWidget.typedInput("type");
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
