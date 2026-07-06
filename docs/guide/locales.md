# Locales & Help Docs

NRG supports internationalization (i18n) for node labels, help documentation, and error messages. Label files are the single source of truth — they drive both the runtime editor UI and auto-generated help docs.

## Directory Structure

```
src/resources/locales/
├── labels/
│   └── {type}/
│       ├── en-US.json     ← required
│       ├── de.json         ← optional
│       └── pt-BR.json      ← optional
└── docs/
    └── {type}/
        ├── en-US.md        ← optional manual help doc
        └── de.html         ← optional manual help doc
```

- **Labels** (`src/resources/locales/labels/`) — JSON files with human-readable labels and descriptions
- **Docs** (`src/resources/locales/docs/`) — optional manual help docs (Markdown or HTML) for the Node-RED info panel

## Label File Format

Each label file follows a standard flat format. Add `$schema` for IDE validation and autocomplete:

```json
{
  "$schema": "https://unpkg.com/@bonsae/nrg/json-schemas/labels.schema.json",
  "label": "My Node",
  "paletteLabel": "Node",
  "description": "What this node does",
  "inputLabels": "Input",
  "outputLabels": ["Success", "Error"],
  "configs": {
    "url": "API URL",
    "timeout": "Timeout (ms)"
  },
  "credentials": {
    "apiKey": "API Key"
  },
  "input": {
    "payload": "Message Payload"
  },
  "outputs": [
    {
      "result": "Processed Result"
    }
  ],
  "errors": {
    "timeout": "Request timed out after __timeout__ms"
  }
}
```

### Fields

| Field | Required | Description |
| --- | --- | --- |
| `label` | Yes | Display name shown in the palette and workspace. Also used as the canvas label when no `name` is set. |
| `paletteLabel` | No | Label shown in the palette. Falls back to `label` if not set. |
| `description` | No | Node description for the help panel and palette tooltip. |
| `inputLabels` | No | Label for the input port (string). |
| `outputLabels` | No | Labels for indexed output ports — an array of strings, one per port. Named ports (by their declared port names) and built-in ports (error/complete/status) are labeled automatically. |
| `configs` | No | Labels for config properties (maps property key → display label). Keys must match property names in your `configSchema` — e.g., `configs.url` provides the label for the `url` field. Also used in the auto-generated editor form. |
| `options` | No | User-facing labels for enum/union option values, keyed by config field then option value — e.g. `"provider": { "anthropic": "Anthropic API" }`. Unset values fall back to the raw option value. |
| `credentials` | No | Labels for credential properties |
| `input` | No | Labels for input schema properties |
| `outputs` | No | Per-port labels for the auto-generated help docs. An array of label maps (in output-port order) for positional ports, or an object keyed by port name for named ports. |
| `errors` | No | Custom error messages. Use `__field__` for placeholder substitution. |

### Named Output Ports

When your node has named output ports — a `Port<T>` record in the `TOutput` generic, or a record `outputsSchema` — the editor labels each port from its **port name** automatically; you don't set `outputLabels`. For the auto-generated help docs, provide `outputs` as an object keyed by port name:

```json
{
  "$schema": "https://unpkg.com/@bonsae/nrg/json-schemas/labels.schema.json",
  "label": "Router",
  "outputs": {
    "success": { "payload": "Result" },
    "failure": { "error": "Error Message" }
  }
}
```

This matches the named ports defined in your schema:

```typescript
export const OutputSchema = {
  success: defineSchema({ payload: SchemaType.String() }, { $id: "router:success" }),
  failure: defineSchema({ error: SchemaType.String() }, { $id: "router:failure" }),
};
```

### Rules

- **Always flat** — do not nest under the node type key. The build system wraps it automatically.
- **`outputLabels` is an array** — one entry per indexed output port. Named and built-in ports are labeled automatically (from their port names, and error/complete/status).
- **`outputs` is an array** for positional outputs — even for single-output nodes, use `[{ ... }]`
- **`outputs` is an object** for named output ports — use `{ portName: { ... } }`
- **`name` is optional** in `configs` — it's a system field and already has a built-in label
- **`configs` labels are used in forms** — the auto-generated editor form resolves field labels from `configs` in the locale file, falling back to camelCase formatting

### JSON Schema

**Always add `$schema` to your label files.** NRG ships a JSON Schema that gives you validation, autocomplete, and inline documentation in VS Code and JetBrains IDEs:

```json
{
  "$schema": "https://unpkg.com/@bonsae/nrg/json-schemas/labels.schema.json",
  "label": "My Node"
}
```

For local development or when using a linked package, use the local path instead:

```json
{
  "$schema": "./node_modules/@bonsae/nrg/json-schemas/labels.schema.json",
  "label": "My Node"
}
```

<details>
<summary>Full JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://unpkg.com/@bonsae/nrg/json-schemas/labels.schema.json",
  "title": "NRG Node Labels",
  "description": "Label file for NRG Node-RED nodes.",
  "type": "object",
  "required": ["label"],
  "properties": {
    "$schema": {
      "type": "string"
    },
    "label": {
      "type": "string",
      "description": "Display name in the palette and workspace"
    },
    "description": {
      "type": "string",
      "description": "Node description for auto-generated help docs"
    },
    "paletteLabel": {
      "type": "string",
      "description": "Label shown in the palette. Falls back to 'label' if not set."
    },
    "inputLabels": {
      "type": "string",
      "description": "Label for the input port"
    },
    "outputLabels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Labels for indexed output ports, one per port"
    },
    "configs": {
      "$ref": "#/$defs/labelMap"
    },
    "options": {
      "$ref": "#/$defs/portLabelMap",
      "description": "User-facing labels for enum/union option values, keyed by config field then option value. Unset values fall back to the raw option value."
    },
    "credentials": {
      "$ref": "#/$defs/labelMap"
    },
    "input": {
      "$ref": "#/$defs/labelMap"
    },
    "outputs": {
      "oneOf": [
        { "type": "array", "items": { "$ref": "#/$defs/labelMap" } },
        { "$ref": "#/$defs/portLabelMap" }
      ],
      "description": "Per-port output labels — array for indexed ports (matches outputsSchema order), or object keyed by port name for named ports"
    },
    "errors": {
      "$ref": "#/$defs/labelMap"
    }
  },
  "additionalProperties": false,
  "$defs": {
    "labelMap": {
      "type": "object",
      "additionalProperties": { "type": "string" },
      "description": "Maps property keys to human-readable labels"
    },
    "portLabelMap": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/labelMap" },
      "description": "Maps output port names to their per-property labels (named output ports)"
    }
  }
}
```

</details>

## Auto-Generated Help Docs

When a node type has **no manual doc** in `src/resources/locales/docs/{type}/{lang}.md` or `.html`, the build system auto-generates help documentation from:

1. **`description`** from the label file — shown at the top of the help panel
2. **Schema properties** — rendered as an HTML table with Property, Label, Type, Required, Default, and Description columns
3. **Port labels** — from `outputLabels`/`inputLabels` on the node class

### How it works

For each node type, the help generator:
1. Discovers which languages have label files in `src/resources/locales/labels/{type}/`
2. For each language, checks if a manual doc exists — if so, skips auto-generation
3. Reads labels from the label file and schema metadata from the server bundle
4. Generates a Markdown help doc with HTML tables and appends it to the build output

This means: **create a label file in a new language → help docs are generated automatically for that language.**

### Example output

For a node with this label file:

```json
{
  "label": "Splitter",
  "description": "Splits messages based on a threshold.",
  "configs": { "threshold": "Threshold" },
  "input": { "payload": "Payload" },
  "outputs": [
    { "payload": "Value", "label": "Label" },
    { "payload": "Value", "label": "Label" }
  ]
}
```

The generated help panel shows:

> **Properties**
>
> | Property | Label | Type | Required | Default | Description |
> | --- | --- | --- | --- | --- | --- |
> | threshold | Threshold | number | Yes | 50 | Numeric threshold |
>
> **Input**
>
> | Property | Label | Type | Required | Default | Description |
> | --- | --- | --- | --- | --- | --- |
> | payload | Payload | number | Yes | | Numeric value |
>
> **Outputs**
>
> *Port 1*
>
> | Property | Label | ... |
> | --- | --- | --- |
> | payload | Value | ... |

## Manual Help Docs

For full control, create a manual doc at `src/resources/locales/docs/{type}/{lang}.md` (Markdown) or `.html` (HTML). Manual docs take priority — the auto-generator skips any node that has one.

```markdown
<!-- src/resources/locales/docs/my-node/en-US.md -->
This node processes incoming messages and transforms them.

### Properties

- **url** — The target API endpoint
- **timeout** — Request timeout in milliseconds
```

## Using Labels at Runtime

In Vue form components, use `$i18n()` to resolve labels:

```vue
<template>
  <NodeRedInput
    v-model="node.url"
    :label="$i18n('configs.url')"
  />
</template>
```

`$i18n('configs.url')` resolves to `RED._('my-node.configs.url')`, which looks up the label from the loaded locale catalog.

## Supported Languages

`en-US`, `de`, `es-ES`, `fr`, `ko`, `pt-BR`, `ru`, `ja`, `zh-CN`, `zh-TW`
