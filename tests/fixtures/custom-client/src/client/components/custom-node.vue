<template>
  <div class="custom-form">
    <div class="form-row">
      <NodeRedInput
        v-model:value="node.name"
        label="Name"
        icon="tag"
        :error="errors['node.name']"
      />
    </div>
    <div class="form-row">
      <NodeRedInput
        v-model:value="node.message"
        label="Message"
        icon="comment"
        :error="errors['node.message']"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "CustomNodeForm",
  props: {
    node: { type: Object, required: true },
    errors: { type: Object, default: () => ({}) },
  },
});
</script>
