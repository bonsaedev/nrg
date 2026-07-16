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
  "configs": {
    "url": "API URL",
    "timeout": "Timeout (ms)"
  },
  "credentials": {
    "apiKey": "API Key"
  },
  "input": {
    "label": "Request",
    "description": "The message to process."
  },
  "outputs": {
    "result": {
      "label": "Result",
      "description": "The processed result."
    },
    "error": {
      "label": "Error",
      "description": "Emitted when the request fails."
    }
  },
  "errors": {
    "timeout": "Request timed out after __timeout__ms"
  }
}
```

Both `input` and each `outputs` entry are shaped `{ label, description }`: the **label** is the port's name on the canvas, and the **description** is the free-text shown in the port's row of the auto-generated help docs. Both keys are optional — an unset label leaves the port unlabeled on the canvas; in the generated help docs the port's row falls back to its declared port name.

### Fields

| Field | Required | Description |
| --- | --- | --- |
| `label` | Yes | Display name shown in the palette and workspace. Also used as the canvas label when no `name` is set. |
| `paletteLabel` | No | Label shown in the palette. Falls back to `label` if not set. |
| `description` | No | Node description for the help panel and palette tooltip. |
| `configs` | No | Labels for config properties (maps property key → display label). Keys must match property names in your `configSchema` — e.g., `configs.url` provides the label for the `url` field. Also used in the auto-generated editor form. |
| `options` | No | Friendly names for the choices in a dropdown field. Nest them by field name, then by the stored value — e.g. `{ "provider": { "anthropic": "Anthropic API" } }`. Any value you don't list keeps its raw name. |
| `credentials` | No | Labels for credential properties |
| `input` | No | The single input port as `{ label, description }` — its canvas name and a help-doc description. |
| `outputs` | No | The output ports. Use an **object keyed by port name** (named outputs — the common case) or an **array in tuple order** (positional/dynamic outputs); each entry is `{ label, description }`. |
| `errors` | No | Custom error messages. Use `__field__` for placeholder substitution. |

### Named Output Ports

When your node declares named output ports (say a `success` port and a `failure` port), key the `outputs` object by those port names:

```json
"outputs": {
  "success": { "label": "Success", "description": "Emitted when the call succeeds." },
  "failure": { "label": "Failure", "description": "Emitted when the call fails." }
}
```

An unset `label` shows no text on the canvas (the declared port name is used only in the generated help docs' Port column), so add an entry for any port you want labeled on the canvas or described in the help docs. The built-in error/complete/status ports are labeled automatically — leave them out.

### Rules

- **Always flat** — do not nest under the node type key. The build system wraps it automatically.
- **`input` / `outputs` are per-port `{ label, description }`** — key `outputs` by port name (named ports) or by tuple index via an array (positional ports). Built-in error/complete/status ports are labeled automatically.
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
      "$ref": "#/$defs/port",
      "description": "The single input port: its display label (shown on the canvas + as the help-doc heading) and description."
    },
    "outputs": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": { "$ref": "#/$defs/port" }
        },
        {
          "type": "array",
          "items": { "$ref": "#/$defs/port" }
        }
      ],
      "description": "Output ports. Use an object keyed by port name for named outputs (the common case), or an array in tuple order for positional/dynamic outputs. Each entry gives the port's display label and description."
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
      "description": "Maps a config field to its per-option-value labels"
    },
    "port": {
      "type": "object",
      "properties": {
        "label": {
          "type": "string",
          "description": "The port's display label — shown on the editor canvas and in the Port column of the auto-generated help docs. Falls back to the port name when unset."
        },
        "description": {
          "type": "string",
          "description": "Free-text description of what this port carries, shown in the Description column of the auto-generated help docs (one row per port)."
        }
      },
      "additionalProperties": false,
      "description": "A single port: its display label and a human-readable description of what it carries."
    }
  }
}
```

</details>

## Auto-Generated Help Docs

When a node type has **no manual doc** in `src/resources/locales/docs/{type}/{lang}.md` or `.html`, the build system auto-generates help documentation from:

1. **`description`** from the label file — shown at the top of the help panel
2. **Configuration / Credentials / Settings** — schema properties rendered as HTML tables with Label, Property, Type, Required, Default, and Description columns
3. **Input & Outputs** — one row per port (Port, Type, Description), with labels and descriptions from the `input` and `outputs` fields in the label file

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
  "input": { "label": "Value", "description": "The number to route." },
  "outputs": {
    "low": { "label": "Low", "description": "Below the threshold." },
    "high": { "label": "High", "description": "At or above the threshold." }
  }
}
```

The generated help panel shows:

> **Configuration**
>
> | Label | Property | Type | Required | Default | Description |
> | --- | --- | --- | --- | --- | --- |
> | Threshold | threshold | number | Yes | 50 | Numeric threshold |
>
> **Input**
>
> | Port | Type | Description |
> | --- | --- | --- |
> | Value | number | The number to route. |
>
> **Outputs**
>
> | Port | Type | Description |
> | --- | --- | --- |
> | Low | number | Below the threshold. |
> | High | number | At or above the threshold. |

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
