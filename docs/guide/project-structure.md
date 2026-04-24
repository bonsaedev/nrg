# Project Structure

An NRG project follows a convention-based layout. The Vite plugin discovers files automatically based on this structure.

```
my-node-red-nodes/
├── vite.config.ts                 # Vite + nodeRed() plugin
├── tsconfig.json                  # Root TypeScript config (references)
├── package.json
├── node-red.settings.ts           # Optional Node-RED runtime settings
├── src/
│   ├── server/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/server.json
│   │   ├── index.ts               # Server entry — exports { nodes: [...] }
│   │   ├── nodes/
│   │   │   └── {type-id}.ts       # Node class (extends IONode/ConfigNode)
│   │   └── schemas/
│   │       └── {type-id}.ts       # TypeBox schema definition
│   ├── client/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/client.json
│   │   ├── index.ts               # Client entry — registerTypes([...])
│   │   ├── public/                # Static files copied to dist/resources/
│   │   ├── nodes/
│   │   │   └── {type-id}.ts       # Client node definition (defineNode)
│   │   └── components/
│   │       └── {type-id}.vue      # Vue 3 SFC for the editor form (optional)
│   ├── examples/
│   │   └── {example-name}.json    # Example flow.json files
│   ├── icons/
│   │   └── {type-id}.png          # Palette icon (20x20 recommended)
│   └── locales/
│       ├── labels/
│       │   └── {type-id}/
│       │       └── {lang}.json    # i18n label strings
│       └── docs/
│           └── {type-id}/
│               └── {lang}.{md|html}  # Help sidebar documentation
└── dist/                          # Build output (git-ignored)
```

## Key Directories

### `src/server/`

Contains the Node.js runtime code. Each node is a TypeScript class extending `IONode` (for message-processing nodes) or `ConfigNode` (for configuration nodes). Schemas live alongside in `schemas/`.

The entry file (`index.ts`) exports an object with a `nodes` array listing all node classes.

### `src/client/`

Contains the browser-side code that registers nodes with the Node-RED editor. Each file in `nodes/` calls `defineNode()` to configure a node's editor behavior — category, color, form component, etc.

The entry file (`index.ts`) calls `registerTypes()` with all node definitions.

### `src/client/components/`

Optional Vue 3 single-file components (`.vue`) used as custom editor forms. When a file named `{type}.vue` exists here, it replaces the auto-generated JSON schema form for that node. NRG provides built-in components like `<NodeRedInput>`, `<NodeRedTypedInput>`, and `<NodeRedConfigInput>` for building forms.

### `src/examples/`

Example `flow.json` files that demonstrate how to use your nodes. These are copied to the build output and can be imported by users into their Node-RED instance.

### `src/icons/`

PNG icons displayed in the Node-RED palette. Name them to match the node type (e.g., `my-node.png`).

### `src/locales/`

Internationalization files. Labels provide translatable strings for the editor UI. Docs provide help text shown in the Node-RED info sidebar.

### `dist/`

The build output. Contains the compiled CJS server bundle, HTML with embedded client code, icons, locales, and a generated `package.json` ready for publishing or installing into Node-RED.
