# Project Structure

An NRG project follows a convention-based layout. The Vite plugin discovers files automatically based on this structure.

```
my-node-red-nodes/
├── vite.config.ts                 # Vite + nrg() plugin
├── tsconfig.json                  # Root TypeScript config (references)
├── package.json
├── node-red.settings.ts           # Optional Node-RED runtime settings
├── src/
│   ├── server/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/core/server.json
│   │   ├── index.ts               # Server entry — exports { nodes: [...] }
│   │   ├── nodes/
│   │   │   └── {type-id}.ts       # Node class (extends IONode/ConfigNode)
│   │   └── schemas/
│   │       └── {type-id}.ts       # TypeBox schema definition
│   ├── client/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/core/client.json
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
├── tests/
│   ├── server/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/test/server/unit.json
│   │   └── {type-id}.test.ts      # Server-side unit tests
│   └── client/
│       ├── unit/
│       │   ├── tsconfig.json      # Extends @bonsae/nrg/tsconfig/test/client/unit.json
│       │   └── {module}.test.ts   # Client TS logic unit tests
│       ├── component/
│       │   ├── tsconfig.json      # Extends @bonsae/nrg/tsconfig/test/client/component.json
│       │   └── {type-id}.test.ts  # Vue component tests
│       └── e2e/
│           ├── tsconfig.json      # Extends @bonsae/nrg/tsconfig/test/client/e2e.json
│           └── {type-id}.test.ts  # Browser E2E tests (Playwright)
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

### `node-red.settings.ts`

Optional Node-RED runtime settings file. Customizes the Node-RED instance used in development mode (flow file, logging, credential secret, etc.). See [Building & Running](./building-and-running#node-red-settings) for details.

### `tests/`

Tests for your nodes, organized by domain and type. Server-side unit tests use `@bonsae/nrg/test/server/unit`, client unit tests use `@bonsae/nrg/test/client/unit`, component tests use `@bonsae/nrg/test/client/component`, and browser E2E tests use `@bonsae/nrg/test/client/e2e`. See [Testing](./testing) for setup and API details.

### `dist/`

The build output directory. Contains everything needed to publish your node package to npm or install directly into Node-RED:

```
dist/
├── index.js              # CJS bridge — loads the ESM server bundle
├── index.mjs             # ESM server bundle (your node classes)
├── index.d.ts            # Auto-generated server type declarations
├── index.html            # Client HTML with resource links
├── resources/
│   └── index.[hash].js   # Client bundle (Vue components, registration)
├── icons/
│   └── {type}.png        # Palette icons
├── locales/
│   └── {lang}/
│       ├── index.json    # Merged label strings
│       └── index.html    # Auto-generated help docs
├── examples/
│   └── {name}.json       # Example flows
└── package.json          # Generated package.json for publishing
```

The `index.d.ts` file contains auto-generated TypeScript declarations for the server side that consumers import when using your schemas or node definitions from their own code. See [Building & Running](./building-and-running#production-build) for details on the build process.
