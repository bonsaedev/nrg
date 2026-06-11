<template>
  <div class="custom-form-node">
    <div class="form-row">
      <NodeRedInput
        v-model:value="node.name"
        label="Name"
        icon="tag"
        :error="errors['node.name']"
      />
    </div>
    <div class="form-row">
      <NodeRedTypedInput
        v-model:value="node.sobject"
        label="SObject"
        :types="sobjectTypes"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { useFormNode } from "@bonsae/nrg/client";

const SOBJECTS = ["Account", "AccountContactRole", "Case", "Contact", "Lead"];

export default defineComponent({
  name: "CustomFormNodeForm",
  setup() {
    const { node, errors } = useFormNode();

    const sobjectTypes = [
      {
        value: "sobject",
        label: "SObject",
        autoComplete: (
          value: string,
          done: (matches: Array<{ value: string; label: string }>) => void,
        ) => {
          done(
            SOBJECTS.filter((s) =>
              s.toLowerCase().startsWith(value.toLowerCase()),
            ).map((s) => ({ value: s, label: s })),
          );
        },
      },
    ];

    return { node, errors, sobjectTypes };
  },
});
</script>
