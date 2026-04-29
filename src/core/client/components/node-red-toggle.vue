<template>
  <div class="nrg-toggle-wrapper">
    <label class="nrg-toggle" :class="{ 'nrg-toggle--checked': modelValue }">
      <input
        type="checkbox"
        :checked="modelValue"
        class="nrg-toggle__input"
        @change="
          $emit(
            'update:modelValue',
            ($event.target as HTMLInputElement).checked,
          )
        "
      />
      <span v-if="icon || label" class="nrg-toggle__label">
        <i v-if="icon" :class="iconClass"></i>
        {{ label }}
      </span>
      <span class="nrg-toggle__slider"></span>
    </label>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "NodeRedToggle",
  props: {
    modelValue: {
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
  },
  emits: ["update:modelValue"],
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
.nrg-toggle-wrapper {
  display: inline-flex;
  align-items: center;
}

.nrg-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  gap: 8px;
  user-select: none;
}

.nrg-toggle__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.nrg-toggle__slider {
  position: relative;
  display: inline-block;
  width: 36px;
  min-width: 36px;
  height: 20px;
  background-color: var(--red-ui-secondary-border-color, #ccc);
  border-radius: 10px;
  transition: background-color 0.2s ease;
}

.nrg-toggle__slider::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.nrg-toggle--checked .nrg-toggle__slider {
  background-color: var(--red-ui-text-color-link, #0070d2);
}

.nrg-toggle--checked .nrg-toggle__slider::after {
  transform: translateX(16px);
}

.nrg-toggle__label {
  cursor: default;
  white-space: nowrap;
}

.nrg-toggle__label i {
  margin-right: 2px;
}
</style>
