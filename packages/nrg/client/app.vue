<template>
  <div style="width: 100%">
    <NodeRedNodeForm :node="localNode" :schema="schema" :errors="errors" style="width: 100%" />
    <div v-if="features.hasInputSchema || features.hasOutputSchema" class="nrg-validation-toggles">
      <div v-if="features.hasInputSchema" class="form-row" style="display: flex; align-items: center; gap: 8px;">
        <input
          :id="`node-input-validateInput-${localNode.id}`"
          type="checkbox"
          :checked="localNode.validateInput"
          style="width: auto; margin: 0;"
          @change="localNode.validateInput = ($event.target as HTMLInputElement).checked"
        />
        <span class="nrg-label" style="width: auto;">Validate Input</span>
      </div>
      <div v-if="features.hasOutputSchema" class="form-row" style="display: flex; align-items: center; gap: 8px;">
        <input
          :id="`node-input-validateOutput-${localNode.id}`"
          type="checkbox"
          :checked="localNode.validateOutput"
          style="width: auto; margin: 0;"
          @change="localNode.validateOutput = ($event.target as HTMLInputElement).checked"
        />
        <span class="nrg-label" style="width: auto;">Validate Output</span>
      </div>
    </div>
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
      type: Object as PropType<{ hasInputSchema: boolean; hasOutputSchema: boolean }>,
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
        if ((propSchema as any).type === "array" && !Array.isArray(this.localNode[prop])) {
          const val = this.localNode[prop];
          this.localNode[prop] = val ? String(val).split(",").filter(Boolean) : [];
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
            error.parentSchema.format === "password" &&
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

:deep(.nrg-label) {
  display: inline-block;
  width: 100%;
  cursor: default;
}
</style>
