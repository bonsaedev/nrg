<template>
  <div>
    <div v-for="field in configFields" :key="field.key" class="form-row">
      <NodeRedInput
        v-if="field.inputType === 'text' || field.inputType === 'number'"
        :value="node[field.key]"
        :type="field.htmlType"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <div v-else-if="field.inputType === 'boolean'">
        <NodeRedInputLabel
          :label="field.label"
          :icon="field.icon"
          :required="field.required"
          style="width: auto"
        />
        <input
          type="checkbox"
          :checked="node[field.key]"
          style="width: auto; margin: 0"
          @change="
            (e) => {
              node[field.key] = (e.target as HTMLInputElement).checked;
            }
          "
        />
      </div>

      <NodeRedSelectInput
        v-else-if="field.inputType === 'select'"
        :value="node[field.key]"
        :options="field.options!"
        :multiple="field.multiple"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <NodeRedTypedInput
        v-else-if="field.inputType === 'typed'"
        :value="node[field.key]"
        :types="field.types"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <NodeRedConfigInput
        v-else-if="field.inputType === 'config'"
        :value="node[field.key]"
        :type="field.configType!"
        :node="node"
        :prop-name="field.key"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />

      <div v-else-if="field.inputType === 'array-text'">
        <NodeRedInputLabel
          :label="field.label"
          :icon="field.icon"
          :required="field.required"
        />
        <span
          style="
            display: block;
            font-size: 11px;
            color: var(--red-ui-text-color-disabled, #999);
            margin-bottom: 4px;
          "
        >
          One entry per line
        </span>
        <textarea
          :value="
            Array.isArray(node[field.key])
              ? node[field.key].join('\n')
              : (node[field.key] ?? '')
          "
          rows="4"
          style="
            width: 100%;
            resize: vertical;
            font-family: monospace;
            font-size: 13px;
          "
          @input="
            node[field.key] = ($event.target as HTMLTextAreaElement).value
              .split('\n')
              .filter(Boolean)
          "
        />
        <span
          v-if="errors[`node.${field.key}`]"
          class="node-red-vue-input-error-message"
        >
          {{ errors[`node.${field.key}`] }}
        </span>
      </div>

      <NodeRedEditorInput
        v-else-if="field.inputType === 'editor'"
        :value="node[field.key]"
        :language="field.language"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        @update:value="node[field.key] = $event"
      />
    </div>

    <div
      v-for="field in credentialFields"
      :key="`cred-${field.key}`"
      class="form-row"
    >
      <NodeRedInput
        :value="node.credentials[field.key]"
        :type="field.htmlType"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.credentials.${field.key}`]"
        @update:value="node.credentials[field.key] = $event"
      />
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
import NodeRedInput from "./node-red-input.vue";
import NodeRedSelectInput from "./node-red-select-input.vue";
import NodeRedTypedInput from "./node-red-typed-input.vue";
import NodeRedConfigInput from "./node-red-config-input.vue";
import NodeRedEditorInput from "./node-red-editor-input.vue";

// System fields managed by Node-RED — not shown in the editor form.
const SKIP_FIELDS = new Set([
  "id",
  "type",
  "x",
  "y",
  "z",
  "g",
  "wires",
  "credentials",
  "_users",
  "validateInput",
  "validateOutput",
]);

interface NrgFormOptions {
  icon?: string;
  typedInputTypes?: string[];
  editorLanguage?: string;
}

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
  "x-nrg-node-type"?: string;
  "x-nrg-form"?: NrgFormOptions;
  [key: string]: any;
}

interface FormField {
  key: string;
  label: string;
  icon: string;
  inputType:
    | "text"
    | "number"
    | "boolean"
    | "select"
    | "typed"
    | "config"
    | "editor"
    | "array-text";
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

function buildField(
  key: string,
  schema: FieldSchema,
  required: boolean,
): FormField {
  const label = schema.title || formatLabel(key);
  const form = schema["x-nrg-form"] ?? {};
  const icon = form.icon || "";

  // NodeRef → config input
  if (schema["x-nrg-node-type"]) {
    return {
      key,
      label,
      icon,
      inputType: "config",
      required,
      configType: schema["x-nrg-node-type"],
    };
  }

  // TypedInput → typed input widget
  if (isTypedInput(schema)) {
    return {
      key,
      label,
      icon,
      inputType: "typed",
      required,
      types: form.typedInputTypes,
    };
  }

  // Array with enum items → multi-select
  if (schema.type === "array" && schema.items?.enum) {
    return {
      key,
      label,
      icon,
      inputType: "select",
      required,
      multiple: true,
      options: schema.items.enum.map((v: any) => ({
        value: String(v),
        label: String(v),
      })),
    };
  }

  // Top-level enum → single select
  if (schema.enum) {
    return {
      key,
      label,
      icon,
      inputType: "select",
      required,
      multiple: false,
      options: schema.enum.map((v: any) => ({
        value: String(v),
        label: String(v),
      })),
    };
  }

  const rawType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (rawType) {
    case "boolean":
      return { key, label, icon, inputType: "boolean", required };

    case "number":
    case "integer":
      return {
        key,
        label,
        icon,
        inputType: "number",
        required,
        htmlType: "number",
      };

    case "array":
      if (form.editorLanguage) {
        return {
          key,
          label,
          icon,
          inputType: "editor",
          required,
          language: form.editorLanguage,
        };
      }
      // Plain array of strings → comma-separated text input
      return { key, label, icon, inputType: "array-text", required };

    case "object":
      if (form.editorLanguage) {
        return {
          key,
          label,
          icon,
          inputType: "editor",
          required,
          language: form.editorLanguage,
        };
      }
      // Plain object → text input (stored as JSON string)
      return {
        key,
        label,
        icon,
        inputType: "text",
        required,
        htmlType: "text",
      };

    default:
      // string with editor language → code editor
      if (form.editorLanguage) {
        return {
          key,
          label,
          icon,
          inputType: "editor",
          required,
          language: form.editorLanguage,
        };
      }
      // string (or untyped)
      return {
        key,
        label,
        icon,
        inputType: "text",
        required,
        htmlType: schema.format === "password" ? "password" : "text",
      };
  }
}

export default defineComponent({
  name: "NodeRedJsonSchemaForm",
  components: {
    NodeRedInputLabel,
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
        .map(([key, propSchema]) =>
          buildField(key, propSchema as FieldSchema, required.has(key)),
        );
    },
    credentialFields(): FormField[] {
      const credSchema = this.schema?.properties?.credentials as
        | FieldSchema
        | undefined;
      if (!credSchema?.properties) return [];
      const required = new Set(credSchema.required ?? []);
      return Object.entries(credSchema.properties).map(([key, propSchema]) => {
        const f = buildField(key, propSchema as FieldSchema, required.has(key));
        // Force credential fields to be text/password inputs
        if (f.inputType !== "text") {
          return {
            ...f,
            inputType: "text" as const,
            htmlType:
              (propSchema as FieldSchema).format === "password"
                ? ("password" as const)
                : ("text" as const),
          };
        }
        return f;
      });
    },
  },
});
</script>
