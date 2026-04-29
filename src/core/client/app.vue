<template>
  <div
    v-if="features.hasInputSchema || features.hasOutputSchema"
    class="form-row"
    style="display: flex; align-items: center; gap: 12px"
  >
    <NodeRedToggle
      v-if="features.hasInputSchema"
      :model-value="localNode.validateInput"
      label="Validate Input"
      style="flex: 1"
      @update:model-value="localNode.validateInput = $event"
    />
    <NodeRedToggle
      v-if="features.hasOutputSchema"
      :model-value="localNode.validateOutput"
      label="Validate Output"
      style="flex: 1"
      @update:model-value="localNode.validateOutput = $event"
    />
  </div>
  <div style="width: 100%; padding-bottom: 12px">
    <NodeRedNodeForm
      :node="localNode"
      :schema="schema"
      :errors="errors"
      style="width: 100%"
    />
  </div>
</template>

<script lang="ts">
import jsonpointer from "jsonpointer";
import { type JSONSchemaType } from "ajv";
import type { PropType } from "vue";
import { defineComponent } from "vue";
import { validator } from "../validator";

export default defineComponent({
  name: "NodeRedVueApp",
  props: {
    node: {
      type: Object,
      required: true,
    },
    schema: {
      type: Object as PropType<JSONSchemaType<any>>,
      required: true,
    },
    features: {
      type: Object as PropType<{
        hasInputSchema: boolean;
        hasOutputSchema: boolean;
      }>,
      required: true,
    },
  },
  data() {
    return {
      localNode: this.node,
      errors: {},
    };
  },
  beforeMount() {
    // Normalize array-typed properties to actual arrays. Nodes saved with an
    // older version of the code may have stored array values as comma-separated
    // strings; this ensures validation and future saves always see real arrays.
    if (this.schema?.properties) {
      for (const [prop, propSchema] of Object.entries(this.schema.properties)) {
        if (
          (propSchema as any).type === "array" &&
          !Array.isArray(this.localNode[prop])
        ) {
          const val = this.localNode[prop];
          this.localNode[prop] = val
            ? String(val).split(",").filter(Boolean)
            : [];
        }
      }
    }

    // Set __PWD__ for existing password fields before the first validation so
    // the password-skip logic in validate() sees the sentinel value correctly.
    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        if (
          this.localNode._def.credentials[prop].type === "password" &&
          this.localNode.credentials[`has_${prop}`]
        ) {
          this.localNode.credentials[prop] = "__PWD__";
        }
      });
    }

    this.validate();

    if (this.localNode._def.defaults) {
      Object.keys(this.localNode._def.defaults).forEach((prop) => {
        this.$watch(
          () => this.localNode[prop],
          () => {
            this.validate();
          },
          { deep: true },
        );
      });
    }

    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        this.$watch(
          () => this.localNode.credentials[prop],
          (newVal, oldVal) => {
            this.validate();

            if (
              this.localNode._def.credentials[prop].type === "password" &&
              newVal !== oldVal
            ) {
              this.localNode.credentials[`has_${prop}`] = !!newVal;
            }
          },
          { deep: true },
        );
      });
    }
  },
  beforeUnmount() {
    // NOTE: must set credentials prop to undefined to avoid updating it to __PWD__ in the server
    if (this.localNode._def.credentials) {
      Object.keys(this.localNode._def.credentials).forEach((prop) => {
        if (
          this.localNode._def.credentials[prop].type === "password" &&
          this.localNode.credentials?.[`has_${prop}`] &&
          this.localNode.credentials?.[prop] === "__PWD__"
        ) {
          this.localNode.credentials[prop] = undefined;
        }
      });
    }
  },
  methods: {
    validate() {
      const result = validator.validate(this.localNode, this.schema, {
        cacheKey: `node-schema-${this.node.type}`,
      });

      if (!result.valid) {
        this.errors = result.errors.reduce((acc, error) => {
          const errorValue = jsonpointer.get(
            this.localNode,
            error.instancePath,
          );
          if (
            error.parentSchema?.format === "password" &&
            errorValue === "__PWD__"
          ) {
            return acc;
          } else {
            const key = `node${error.instancePath.replaceAll("/", ".")}`;
            acc[key] = error.message;
            return acc;
          }
        }, {});
      } else {
        this.errors = {};
      }
    },
  },
});
</script>

<style scoped>
:deep(.node-red-vue-input-error-message) {
  color: var(--red-ui-text-color-error);
}

:deep(.form-row input[type="text"]),
:deep(.form-row input[type="number"]),
:deep(.form-row input[type="password"]) {
  height: 34px;
  padding: 0 8px;
  box-sizing: border-box;
}
</style>
