<template>
  <div>
    <div v-for="field in configFields" :key="field.key" class="form-row">
      <NodeRedInput
        v-if="field.inputType === 'text' || field.inputType === 'number'"
        v-model:value="node[field.key]"
        :type="field.htmlType"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        :input-id="fieldId(field.key)"
      />

      <div v-else-if="field.inputType === 'boolean' && field.toggle">
        <NodeRedToggle
          :model-value="node[field.key]"
          :label="field.label"
          :icon="field.icon"
          @update:model-value="(val: boolean) => (node[field.key] = val)"
        />
      </div>

      <div v-else-if="field.inputType === 'boolean'">
        <NodeRedInputLabel
          :label="field.label"
          :icon="field.icon"
          :required="field.required"
          :html-for="fieldId(field.key)"
        />
        <input
          :id="fieldId(field.key)"
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
        v-model:value="node[field.key]"
        :options="field.options!"
        :multiple="field.multiple"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        :label-id="fieldId(field.key)"
      />

      <NodeRedTypedInput
        v-else-if="field.inputType === 'typed'"
        v-model:value="node[field.key]"
        :types="field.types"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        :label-id="fieldId(field.key)"
      />

      <NodeRedConfigInput
        v-else-if="field.inputType === 'config'"
        v-model:value="node[field.key]"
        :type="field.configType!"
        :node="node"
        :prop-name="field.key"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        :label-id="fieldId(field.key)"
      />

      <div v-else-if="field.inputType === 'array-text'">
        <NodeRedInputLabel
          :label="field.label"
          :icon="field.icon"
          :required="field.required"
          :html-for="fieldId(field.key)"
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
          :id="fieldId(field.key)"
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
        v-else-if="field.inputType === 'object-json'"
        :value="
          typeof node[field.key] === 'string'
            ? node[field.key]
            : JSON.stringify(node[field.key] ?? {}, null, 2)
        "
        language="json"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        :label-id="fieldId(field.key)"
        @update:value="setObjectField(field.key, $event)"
      />

      <NodeRedEditorInput
        v-else-if="field.inputType === 'editor'"
        v-model:value="node[field.key]"
        :language="field.language"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.${field.key}`]"
        :label-id="fieldId(field.key)"
      />
    </div>

    <div
      v-for="field in credentialFields"
      :key="`cred-${field.key}`"
      class="form-row"
    >
      <NodeRedInput
        v-model:value="node.credentials[field.key]"
        :type="field.htmlType"
        :label="field.label"
        :icon="field.icon"
        :required="field.required"
        :error="errors[`node.credentials.${field.key}`]"
        :input-id="fieldId(`credentials.${field.key}`)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";
import NodeRedInputLabel from "./node-red-input-label.vue";
import NodeRedToggle from "./node-red-toggle.vue";
import NodeRedInput from "./node-red-input.vue";
import NodeRedSelectInput from "./node-red-select-input.vue";
import NodeRedTypedInput from "./node-red-typed-input.vue";
import NodeRedConfigInput from "./node-red-config-input.vue";
import NodeRedEditorInput from "./node-red-editor-input.vue";
import { BUILTIN_PORT_KEYS } from "../../../shared/constants";
import type { JsonPropertySchema } from "../../types";

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
  "validateOutputs",
  "outputs",
  "outputContextModes",
  "outputReturnProperties",
  "outputSchemas",
  "inputSchema",
  ...BUILTIN_PORT_KEYS,
]);

// The schema vocabulary is shared with the server (sdk/lib/shared/schema-options) and
// surfaced through the client types — no local re-declarations.
type FieldSchema = JsonPropertySchema;

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
    | "array-text"
    | "object-json";
  required: boolean;
  htmlType?: "text" | "number" | "password";
  options?: Array<{ value: string; label: string }>;
  multiple?: boolean;
  types?: (NodeRED.DefaultTypedInputType | NodeRED.TypedInputTypeDefinition)[];
  configType?: string;
  language?: string;
  toggle?: boolean;
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

/**
 * A field renders the `*` when it is non-`Optional` — i.e. present in the
 * schema's `required[]`. One rule for every type, shared with the runtime
 * validator (AJV enforces `required[]`) and the generated help docs, so the
 * `*`, the deploy-time error, and the help "Required" column can't drift apart.
 * The validator additionally adds a non-empty constraint (`minLength`/`minItems`
 * of 1) to required strings/arrays; enums, numbers, and booleans are satisfied
 * by their value. Mark a field `SchemaType.Optional(...)` to drop the `*`.
 */
function isFieldRequired(isNonOptional: boolean): boolean {
  return isNonOptional;
}

function buildField(
  key: string,
  schema: FieldSchema,
  required: boolean,
  i18nLabel?: string,
  resolveOptionLabel?: (value: string) => string | undefined,
): FormField {
  const label = i18nLabel || schema.title || formatLabel(key);
  const form = schema["x-nrg-form"] ?? {};
  const icon = form.icon || "";
  // Resolve a user-facing label per option, falling back to the raw value so a
  // picklist never shows a bare enum literal (e.g. "bypassPermissions").
  const optionLabel = (value: unknown): string =>
    resolveOptionLabel?.(String(value)) ?? String(value);

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
      // serialized schemas carry plain strings; trust them as typed-input type names
      types: form.typedInputTypes as FormField["types"],
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
        label: optionLabel(v),
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
        label: optionLabel(v),
      })),
    };
  }

  // Union of literals (anyOf with const) → single select
  if (schema.anyOf && schema.anyOf.every((s: any) => s.const !== undefined)) {
    return {
      key,
      label,
      icon,
      inputType: "select",
      required,
      multiple: false,
      options: schema.anyOf.map((s: any) => ({
        value: String(s.const),
        label: optionLabel(s.const),
      })),
    };
  }

  const rawType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (rawType) {
    case "boolean":
      return {
        key,
        label,
        icon,
        inputType: "boolean",
        required,
        toggle: form.toggle,
      };

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
      // Plain object → JSON textarea that parses to a real object (so AJV's
      // `type: "object"` validates and the saved value is an object, not a
      // never-parsed string).
      return {
        key,
        label,
        icon,
        inputType: "object-json",
        required,
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
    NodeRedToggle,
    NodeRedInput,
    NodeRedSelectInput,
    NodeRedTypedInput,
    NodeRedConfigInput,
    NodeRedEditorInput,
  },
  props: {
    node: {
      type: Object as PropType<NodeRED.BaseNode>,
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
          buildField(
            key,
            propSchema as FieldSchema,
            isFieldRequired(required.has(key)),
            this.resolveI18n("configs", key),
            (value) => this.resolveOptionLabel(key, value),
          ),
        );
    },
    credentialFields(): FormField[] {
      const credSchema = this.schema?.properties?.credentials as
        | FieldSchema
        | undefined;
      if (!credSchema?.properties) return [];
      const required = new Set(credSchema.required ?? []);
      return Object.entries(credSchema.properties).map(([key, propSchema]) => {
        const f = buildField(
          key,
          propSchema as FieldSchema,
          isFieldRequired(required.has(key)),
          this.resolveI18n("credentials", key),
        );
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
  methods: {
    // Deterministic, unique DOM id for a field's control — used to bind a real
    // `<label for>` (native inputs) or an `aria-labelledby` (rehomed jQuery/ACE
    // widgets) for accessible naming. Namespaced by node id so two trays can't
    // collide.
    fieldId(key: string): string {
      const nodeId = (this.node as { id?: string })?.id ?? "node";
      return `nrg-${nodeId}-${key}`;
    },
    // Parse a JSON-object field's textarea into a real object so AJV's
    // `type: "object"` validates and the saved value is an object. On invalid
    // JSON, keep the raw string so the type error surfaces instead of being
    // silently swallowed. Runs on blur (`@change`) so typing isn't reformatted.
    setObjectField(key: string, raw: string): void {
      const node = this.node as Record<string, unknown>;
      try {
        node[key] = JSON.parse(raw);
      } catch {
        node[key] = raw;
      }
    },
    resolveI18n(prefix: string, key: string): string | undefined {
      const resolved = this.$i18n(`${prefix}.${key}`);
      const fullKey = `${this.node.type}.${prefix}.${key}`;
      // RED._() returns the key itself when not found
      if (resolved && resolved !== fullKey && resolved !== `${prefix}.${key}`) {
        return resolved;
      }
      return undefined;
    },
    // Per-option label lookup: `options.<field>.<value>` in the node's locale
    // catalog. Returns undefined when unset so the caller falls back to the raw
    // enum value.
    resolveOptionLabel(field: string, value: string): string | undefined {
      const subKey = `options.${field}.${value}`;
      const resolved = this.$i18n(subKey);
      const fullKey = `${this.node.type}.${subKey}`;
      if (resolved && resolved !== fullKey && resolved !== subKey) {
        return resolved;
      }
      return undefined;
    },
  },
});
</script>
