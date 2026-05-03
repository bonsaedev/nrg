# Locales & Help Docs

NRG supports internationalization (i18n) for node labels, help documentation, and error messages. Label files are the single source of truth — they drive both the runtime editor UI and auto-generated help docs.

## Directory Structure

```
src/locales/
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

- **Labels** (`locales/labels/`) — JSON files with human-readable labels and descriptions
- **Docs** (`locales/docs/`) — optional manual help docs (Markdown or HTML) for the Node-RED info panel

## Label File Format

Each label file follows a standard flat format. Add `$schema` for IDE validation and autocomplete:

```json
{
  "$schema": "https://unpkg.com/@bonsae/nrg/schemas/labels.schema.json",
  "label": "My Node",
  "description": "What this node does",
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
| `label` | Yes | Display name shown in the palette and workspace |
| `description` | No | Node description for the help panel. Supports per-language overrides. |
| `configs` | No | Labels for config properties (maps property key → display label) |
| `credentials` | No | Labels for credential properties |
| `input` | No | Labels for input schema properties |
| `outputs` | No | Array of label maps, one per output port. Matches `outputsSchema` order. |
| `errors` | No | Custom error messages. Use `__field__` for placeholder substitution. |

### Rules

- **Always flat** — do not nest under the node type key. The build system wraps it automatically.
- **`outputs` is an array** — even for single-output nodes, use `[{ ... }]`
- **`name` is optional** in `configs` — it's a system field and already has a built-in label

### JSON Schema

**Always add `$schema` to your label files.** NRG ships a JSON Schema that gives you validation, autocomplete, and inline documentation in VS Code and JetBrains IDEs:

```json
{
  "$schema": "https://unpkg.com/@bonsae/nrg/schemas/labels.schema.json",
  "label": "My Node"
}
```

For local development with a linked package:

```json
{
  "$schema": "./node_modules/@bonsae/nrg/schemas/labels.schema.json",
  "label": "My Node"
}
```

<details>
<summary>Full JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://unpkg.com/@bonsae/nrg/schemas/labels.schema.json",
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
    "configs": {
      "$ref": "#/$defs/labelMap"
    },
    "credentials": {
      "$ref": "#/$defs/labelMap"
    },
    "input": {
      "$ref": "#/$defs/labelMap"
    },
    "outputs": {
      "type": "array",
      "items": { "$ref": "#/$defs/labelMap" },
      "description": "Per-port output labels, matching outputsSchema order"
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
    }
  }
}
```

</details>

## Auto-Generated Help Docs

When a node type has **no manual doc** in `locales/docs/{type}/{lang}.md` or `.html`, the build system auto-generates help documentation from:

1. **`description`** from the label file — shown at the top of the help panel
2. **Schema properties** — rendered as an HTML table with Property, Label, Type, Required, Default, and Description columns
3. **Port labels** — from `outputLabels`/`inputLabels` on the node class

### How it works

For each node type, the help generator:
1. Discovers which languages have label files in `locales/labels/{type}/`
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
> *Port 1 — above*
>
> | Property | Label | ... |
> | --- | --- | --- |
> | payload | Value | ... |

## Manual Help Docs

For full control, create a manual doc at `locales/docs/{type}/{lang}.md` (Markdown) or `.html` (HTML). Manual docs take priority — the auto-generator skips any node that has one.

```markdown
<!-- locales/docs/my-node/en-US.md -->
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
    :value="node.url"
    :label="$i18n('configs.url')"
    @update:value="node.url = $event"
  />
</template>
```

`$i18n('configs.url')` resolves to `RED._('my-node.configs.url')`, which looks up the label from the loaded locale catalog.

## Supported Languages

`en-US`, `de`, `es-ES`, `fr`, `ko`, `pt-BR`, `ru`, `ja`, `zh-CN`, `zh-TW`
