<template>
  <span class="nrg-label">
    <i v-if="icon" :class="iconClass"></i>
    <slot>{{ label }}</slot>
    <span v-if="required" class="nrg-required">*</span>
  </span>
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
