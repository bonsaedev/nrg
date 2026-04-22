<template>
  <div>
    <div v-for="field in configFields" :key="field.key" class="form-row">
      <span class="nrg-label">
        {{ field.label }}
        <span v-if="field.required" class="nrg-required">*</span>
      </span>

      <NodeRedInput
        v-if="field.inputType === 'text' || field.inputType === 'number'"
        :value="node[field.key]"
        :type="field.htmlType"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <div v-else-if="field.inputType === 'boolean'">
        <input
          type="checkbox"
          :checked="node[field.key]"
          @change="(e) => { node[field.key] = (e.target as HTMLInputElement).checked }"
        />
      </div>

      <NodeRedSelectInput
        v-else-if="field.inputType === 'select'"
        :value="node[field.key]"
        :options="field.options!"
        :multiple="field.multiple"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <NodeRedTypedInput
        v-else-if="field.inputType === 'typed'"
        :value="node[field.key]"
        :types="field.types"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <NodeRedConfigInput
        v-else-if="field.inputType === 'config'"
        :value="node[field.key]"
        :type="field.configType!"
        :node="node"
        :prop-name="field.key"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <NodeRedEditorInput
        v-else-if="field.inputType === 'editor'"
        :value="node[field.key]"
        :language="field.language"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />
    </div>

    <div v-for="field in credentialFields" :key="`cred-${field.key}`" class="form-row">
      <span class="nrg-label">
        {{ field.label }}
        <span v-if="field.required" class="nrg-required">*</span>
      </span>

      <NodeRedInput
        :value="node.credentials[field.key]"
        :type="field.htmlType"
        :error="errors[`node.credentials.${field.key}`]"
        @update:value="node.credentials[field.key] = $event"
      />
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";
import NodeRedInput from "./node-red-input.vue";
import NodeRedSelectInput from "./node-red-select-input.vue";
import NodeRedTypedInput from "./node-red-typed-input.vue";
import NodeRedConfigInput from "./node-red-config-input.vue";
import NodeRedEditorInput from "./node-red-editor-input.vue";

// System fields managed by Node-RED — not shown in the editor form.
const SKIP_FIELDS = new Set(["id", "type", "x", "y", "z", "g", "wires", "credentials", "_users", "validateInput", "validateOutput"]);

interface FieldSchema {
  type?: string | string[];
  properties?: Record<string, FieldSchema>;
  required?: string[];
  enum?: any[];
  format?: string;
  title?: string;
  description?: string;
  default?: any;
  items?: FieldSchema;
  "node-type"?: string;
  "x-typed-types"?: string[];
  "x-editor-language"?: string;
  [key: string]: any;
}

interface FormField {
  key: string;
  label: string;
  inputType: "text" | "number" | "boolean" | "select" | "typed" | "config" | "editor";
  required: boolean;
  htmlType?: "text" | "number" | "password";
  options?: Array<{ value: string; label: string }>;
  multiple?: boolean;
  types?: string[];
  configType?: string;
  language?: string;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function isTypedInput(schema: FieldSchema): boolean {
  return (
    schema.type === "object" &&
    !!schema.properties?.value &&
    !!schema.properties?.type
  );
}

function buildField(key: string, schema: FieldSchema, required: boolean): FormField {
  const label = schema.title || formatLabel(key);

  // NodeRef → config input
  if (schema["node-type"]) {
    return { key, label, inputType: "config", required, configType: schema["node-type"] };
  }

  // TypedInput → typed input widget
  if (isTypedInput(schema)) {
    return {
      key,
      label,
      inputType: "typed",
      required,
      types: schema["x-typed-types"],
    };
  }

  // Array with enum items → multi-select
  if (schema.type === "array" && schema.items?.enum) {
    return {
      key,
      label,
      inputType: "select",
      required,
      multiple: true,
      options: schema.items.enum.map((v: any) => ({ value: String(v), label: String(v) })),
    };
  }

  // Top-level enum → single select
  if (schema.enum) {
    return {
      key,
      label,
      inputType: "select",
      required,
      multiple: false,
      options: schema.enum.map((v: any) => ({ value: String(v), label: String(v) })),
    };
  }

  const rawType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (rawType) {
    case "boolean":
      return { key, label, inputType: "boolean", required };

    case "number":
    case "integer":
      return { key, label, inputType: "number", required, htmlType: "number" };

    case "array":
      // Plain array with no enum → JSON editor
      return { key, label, inputType: "editor", required, language: schema["x-editor-language"] || "json" };

    case "object":
      // Plain object → JSON editor
      return { key, label, inputType: "editor", required, language: schema["x-editor-language"] || "json" };

    default:
      // string (or untyped)
      return {
        key,
        label,
        inputType: "text",
        required,
        htmlType: schema.format === "password" ? "password" : "text",
      };
  }
}

export default defineComponent({
  name: "NodeRedJsonSchemaForm",
  components: {
    NodeRedInput,
    NodeRedSelectInput,
    NodeRedTypedInput,
    NodeRedConfigInput,
    NodeRedEditorInput,
  },
  props: {
    node: {
      type: Object as PropType<Record<string, any>>,
      required: true,
    },
    schema: {
      type: Object as PropType<FieldSchema>,
      required: true,
    },
    errors: {
      type: Object as PropType<Record<string, string>>,
      default: () => ({}),
    },
  },
  computed: {
    configFields(): FormField[] {
      if (!this.schema?.properties) return [];
      const required = new Set(this.schema.required ?? []);
      return Object.entries(this.schema.properties)
        .filter(([key]) => !SKIP_FIELDS.has(key))
        .map(([key, propSchema]) => buildField(key, propSchema as FieldSchema, required.has(key)));
    },
    credentialFields(): FormField[] {
      const credSchema = this.schema?.properties?.credentials as FieldSchema | undefined;
      if (!credSchema?.properties) return [];
      const required = new Set(credSchema.required ?? []);
      return Object.entries(credSchema.properties).map(([key, propSchema]) => {
        const f = buildField(key, propSchema as FieldSchema, required.has(key));
        // Force credential fields to be text/password inputs
        if (f.inputType !== "text") {
          return { ...f, inputType: "text" as const, htmlType: (propSchema as FieldSchema).format === "password" ? "password" as const : "text" as const };
        }
        return f;
      });
    },
  },
});
</script>

<style scoped>
.nrg-required {
  color: var(--red-ui-text-color-error);
  margin-left: 2px;
}
</style>
