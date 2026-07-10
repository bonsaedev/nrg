# Locales & Help Docs

You describe your node's on-screen text in small JSON "label" files. NRG uses them in two places: the text you see while editing the node in Node-RED, and the help panel it auto-generates for the node. These files also hold translations for other languages (i18n) and your node's error messages.

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
| `outputLabels` | No | A list of names for your output ports, in order (first entry = first port). You only need it for plain numbered outputs — ports that have names, and the built-in error/complete/status ports, are labeled automatically, so leave those out. |
| `configs` | No | Labels for config properties (maps property key → display label). Keys must match property names in your `configSchema` — e.g., `configs.url` provides the label for the `url` field. Also used in the auto-generated editor form. |
| `options` | No | Friendly names for the choices in a dropdown field. Nest them by field name, then by the stored value — e.g. `{ "provider": { "anthropic": "Anthropic API" } }`. Any value you don't list keeps its raw name. |
| `credentials` | No | Labels for credential properties |
| `input` | No | Labels for input schema properties |
| `outputs` | No | Currently has no effect. Output port names come from `outputLabels` (or the port's declared name), and each output's value type comes from the node's TypeScript output type. |
| `errors` | No | Custom error messages. Use `__field__` for placeholder substitution. |

### Named Output Ports

If your node's outputs have names (say a `success` port and a `failure` port) instead of being plain numbered outputs, the editor labels each port with its name automatically — you don't set `outputLabels`. There's nothing to add to the label file for this: the `outputs` field has no effect on the editor or the generated help docs, and the help table already shows each named port's declared name.

### Rules

- **Always flat** — do not nest under the node type key. The build system wraps it automatically.
- **`outputLabels` is an array** — one entry per indexed output port. Named and built-in ports are labeled automatically (from their port names, and error/complete/status).
- **`name` is optional** in `configs` — it's a system field and already has a built-in label
- **`configs` labels are used in forms** — the auto-generated editor form resolves field labels from `configs` in the locale file, falling back to a spaced, Title-cased version of the field name (e.g. `apiUrl` → 'Api Url')

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
  "description": "Label file for NRG Node-RED nodes. Provides human-readable labels for the editor UI and auto-generated help docs.",
  "type": "object",
  "required": ["label"],
  "properties": {
    "$schema": {
      "type": "string",
      "description": "JSON Schema reference for IDE validation"
    },
    "label": {
      "type": "string",
      "description": "Display name shown in the palette and workspace"
    },
    "paletteLabel": {
      "type": "string",
      "description": "Label shown in the palette. Falls back to 'label' if not set."
    },
    "description": {
      "type": "string",
      "description": "Node description for this language. Overrides the class-level description in auto-generated help docs."
    },
    "inputLabels": {
      "type": "string",
      "description": "Label for the input port."
    },
    "outputLabels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Labels for output ports, one per port."
    },
    "configs": {
      "$ref": "#/$defs/labelMap",
      "description": "Labels for config properties"
    },
    "options": {
      "$ref": "#/$defs/portLabelMap",
      "description": "User-facing labels for enum/union option values, keyed by config field then option value (e.g. \"provider\": { \"anthropic\": \"Anthropic API\" }). Unset values fall back to the raw option value."
    },
    "credentials": {
      "$ref": "#/$defs/labelMap",
      "description": "Labels for credential properties"
    },
    "input": {
      "$ref": "#/$defs/labelMap",
      "description": "Labels for input schema properties"
    },
    "outputs": {
      "oneOf": [
        {
          "type": "array",
          "items": { "$ref": "#/$defs/labelMap" }
        },
        { "$ref": "#/$defs/portLabelMap" }
      ],
      "description": "Per-port output labels. Use an array (matching the Output tuple order; a single output uses a one-element array) for positional outputs, or an object keyed by port name for named outputs."
    },
    "errors": {
      "$ref": "#/$defs/labelMap",
      "description": "Custom error messages. Use __field__ for placeholder substitution."
    }
  },
  "additionalProperties": false,
  "$defs": {
    "labelMap": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      },
      "description": "Maps property keys to human-readable labels"
    },
    "portLabelMap": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/$defs/labelMap"
      },
      "description": "Maps output port names to their per-property labels (named output ports)"
    }
  }
}
```

</details>

## Auto-Generated Help Docs

When a node type has **no manual doc** in `src/resources/locales/docs/{type}/{lang}.md` or `.html`, the build system auto-generates help documentation from:

1. **`description`** from the label file — shown at the top of the help panel
2. **Schema properties** — rendered as an HTML table with Label, Property, Type, Required, Default, and Description columns
3. **Port labels** — from the `input` and `outputLabels` fields in the label file

### How it works

For each node type, the help generator:
1. Discovers which languages have label files in `src/resources/locales/labels/{type}/`
2. For each language, checks if a manual doc exists — if so, skips auto-generation
3. Reads the labels plus the node's extracted type/schema info (from the build's `node-defs.json` and `node-types.json`)
4. Builds an HTML help panel — the description plus property tables — and attaches it to the built node

This means: **create a label file in a new language → help docs are generated automatically for that language.**

### Example output

For a node with this label file:

```json
{
  "label": "Splitter",
  "description": "Splits messages based on a threshold.",
  "configs": { "threshold": "Threshold" },
  "input": { "payload": "Payload" },
  "outputLabels": ["Low", "High"]
}
```

The generated help panel shows:

> **Properties**
>
> | Label | Property | Type | Required | Default | Description |
> | --- | --- | --- | --- | --- | --- |
> | Threshold | threshold | number | Yes | 50 | Numeric threshold |
>
> **Input**
>
> | Label | Property | Type | Required | Description |
> | --- | --- | --- | --- | --- |
> | Payload | payload | number | Yes | Numeric value |
>
> **Outputs**
>
> | Port | Type |
> | --- | --- |
> | Low | number |
> | High | number |

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

`$i18n('configs.url')` resolves to `node._('my-node.configs.url')` — the node's own translation helper — returning the translated text for `configs.url` in the active language, or the key itself when no translation exists.

## Supported Languages

`en-US`, `de`, `es-ES`, `fr`, `ko`, `pt-BR`, `ru`, `ja`, `zh-CN`, `zh-TW`
