<template>
  <component
    :is="htmlFor ? 'label' : 'span'"
    :id="labelId || undefined"
    class="nrg-label"
    :for="htmlFor || undefined"
  >
    <i v-if="icon" :class="iconClass"></i>
    <slot>{{ label }}</slot>
    <span v-if="required" class="nrg-required">*</span>
  </component>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "NodeRedInputLabel",
  props: {
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
    /** When set, render a real `<label for>` bound to a native control's id.
     *  Otherwise a plain `<span>` (unchanged default). */
    htmlFor: {
      type: String,
      default: "",
    },
    /** Puts an `id` on the label so a rehomed widget (jQuery typedInput, ACE
     *  editor) can reference it via `aria-labelledby`, where `for` can't work. */
    labelId: {
      type: String,
      default: "",
    },
  },
  computed: {
    iconClass(): string {
      if (!this.icon) return "";
      const name = this.icon.startsWith("fa-") ? this.icon : `fa-${this.icon}`;
      return `fa ${name}`;
    },
  },
});
</script>

<style scoped>
.nrg-label {
  display: inline-block;
  width: 100%;
  margin-bottom: 4px;
  cursor: default;
}

.nrg-label i {
  margin-right: 5px;
}

.nrg-required {
  color: var(--red-ui-text-color-error);
  margin-left: 2px;
}
</style>
