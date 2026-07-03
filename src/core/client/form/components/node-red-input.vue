<template>
  <div style="display: flex; flex-direction: column; width: 100%">
    <slot name="label">
      <NodeRedInputLabel
        v-if="label"
        :label="label"
        :icon="icon"
        :required="required"
        :html-for="inputId || undefined"
      />
    </slot>
    <input
      :id="inputId || undefined"
      ref="inputField"
      :type="type"
      :value="internalValue"
      :placeholder="placeholder"
      style="width: 100%"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <div v-if="error" class="node-red-vue-input-error-message">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";

const SECRET_PATTERN = "*************";

export default defineComponent({
  components: { NodeRedInputLabel },
  props: {
    modelValue: {
      type: [String, Number],
      default: undefined,
    },
    value: {
      type: [String, Number],
      default: "",
    },
    type: {
      type: String,
      default: "text",
    },
    placeholder: {
      type: String,
      default: "",
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
    /** id for the <input>, bound to the label's `for` for accessible naming. */
    inputId: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue", "update:value", "input"],
  data() {
    return {
      internalValue: "",
      isFocused: false,
    };
  },
  computed: {
    effectiveValue(): string {
      return (
        this.modelValue !== undefined ? this.modelValue : this.value
      ) as string;
    },
  },
  watch: {
    // Sync an EXTERNAL value change into the widget (e.g. a custom form updating
    // an interdependent sibling field via useFormNode). Guarded: never while the
    // user is typing (focused) — that would clobber the caret — and never for
    // password fields, which run their own SECRET_PATTERN/__PWD__ focus dance.
    effectiveValue(newVal: string) {
      if (this.isFocused || this.type === "password") return;
      if (this.internalValue !== newVal) this.internalValue = newVal;
    },
  },
  beforeMount() {
    this.internalValue = this.effectiveValue;
    this.onBlur();
  },
  methods: {
    onInput(event) {
      this.internalValue = event.target.value;
      this.$emit("update:modelValue", this.internalValue);
      this.$emit("update:value", this.internalValue);
      this.$emit("input", this.internalValue);
    },
    onFocus() {
      this.isFocused = true;
      if (this.type === "password" && this.internalValue === SECRET_PATTERN) {
        this.internalValue = "";
      }
    },
    onBlur() {
      this.isFocused = false;
      if (this.type === "password" && this.effectiveValue === "__PWD__") {
        this.internalValue = SECRET_PATTERN;
      }
    },
  },
});
</script>
