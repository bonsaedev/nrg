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
    <!-- A node author reusing the globally-registered NodeRedTray: a button that
         opens a tray whose content is the author's own Vue markup. -->
    <div class="form-row">
      <button
        type="button"
        class="red-ui-button custom-open-tray"
        @click="openCustomTray"
      >
        Open custom tray
      </button>
      <NodeRedTray ref="customTray" title="Custom Tray">
        <div class="custom-tray-body">Hello from a custom Vue tray</div>
      </NodeRedTray>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { useFormNode } from "@bonsae/nrg/client";

const SOBJECTS = ["Account", "AccountContactRole", "Case", "Contact", "Lead"];

export default defineComponent({
  name: "CustomFormNodeForm",
  setup() {
    const { node, errors } = useFormNode();

    const customTray = ref<{ open(): void } | null>(null);
    const openCustomTray = () => customTray.value?.open();

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

    return { node, errors, sobjectTypes, customTray, openCustomTray };
  },
});
</script>
