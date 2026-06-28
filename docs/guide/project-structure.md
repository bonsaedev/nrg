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
│   │   └── nodes/
│   │       └── {type-id}.ts       # Node class (extends IONode/ConfigNode)
│   ├── schemas/                   # Shared contract — server-value, client-type-only
│   │   └── {type-id}.ts           # TypeBox schema definition
│   ├── client/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/core/client.json
│   │   ├── index.ts               # Client entry — registerTypes([...])
│   │   ├── public/                # Static files copied to dist/resources/
│   │   ├── nodes/
│   │   │   └── {type-id}.ts       # Client node definition (defineNode)
│   │   └── components/
│   │       └── {type-id}.vue      # Vue 3 SFC for the editor form (optional)
│   ├── shared/                    # Optional cross-plane code (server + client)
│   └── resources/
│       ├── icons/
│       │   └── {type-id}.{svg|png}    # Palette icon (inlined + copied to dist/icons)
│       ├── locales/
│       │   ├── labels/
│       │   │   └── {type-id}/
│       │   │       └── {lang}.json    # i18n label strings
│       │   └── docs/
│       │       └── {type-id}/
│       │           └── {lang}.{md|html}  # Help sidebar documentation
│       └── examples/              # Any other folder → copied to dist/examples
│           └── {example-name}.json    # Example flow.json files
├── tests/
│   ├── server/
│   │   ├── unit/
│   │   │   ├── tsconfig.json      # Extends @bonsae/nrg/tsconfig/test/server/unit.json
│   │   │   └── {type-id}.test.ts  # Server-side unit tests
│   │   └── integration/
│   │       ├── tsconfig.json      # Extends @bonsae/nrg/tsconfig/test/server/integration.json
│   │       └── {type-id}.test.ts  # Server integration tests (real Node-RED)
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

Contains the Node.js runtime code. Each node is a TypeScript class extending `IONode` (for message-processing nodes) or `ConfigNode` (for configuration nodes).

The entry file (`index.ts`) exports an object with a `nodes` array listing all node classes.

### `src/schemas/`

The TypeBox schemas (config, credentials, input, outputs) — the **shared contract** between the two planes: the **server validates** messages with them (a value import), and the **client types** its forms from them (`import type`). They live at the top level so neither plane reaches into the other's folder.

They are **server-value / client-type-only**, not dual-plane like `src/shared/`: a schema file imports `@bonsae/nrg/server` (which pulls in TypeBox and the node runtime), so **client code must use `import type`** when referencing a schema's types. At runtime the editor form is built from *serialized* schema data injected by the build — TypeBox never ships to the browser. The boundary lint rule enforces this (client value-imports of `**/schemas/**` are an error; `import type` is allowed).

The reverse direction is guarded too: a schema may only **`import type`** from `**/server/**`. Each server node *value*-imports its own schema, so a schema that value-imported a server module would close a runtime import cycle (server node ⇄ schema) and pull the node runtime into the editor bundle. Config-node references therefore go through `SchemaType.NodeRef<T>("type")`, which takes the node `type` string at runtime and the class only as a type-only generic. This is enforced by the `@bonsae/nrg/schema-server-imports-type-only` rule shipped in `nrgConventions` (`@bonsae/nrg/eslint`).

### `src/client/`

Contains the browser-side code that registers nodes with the Node-RED editor. Each file in `nodes/` calls `defineNode()` to configure a node's editor behavior — category, color, form component, etc.

The entry file (`index.ts`) calls `registerTypes()` with all node definitions.

### `src/client/components/`

Optional Vue 3 single-file components (`.vue`) used as custom editor forms. When a file named `{type}.vue` exists here, it replaces the auto-generated JSON schema form for that node. NRG provides built-in components like `<NodeRedInput>`, `<NodeRedTypedInput>`, and `<NodeRedConfigInput>` for building forms.

### `src/shared/`

Optional cross-plane code imported by both the server and the client (shared types, constants, helpers).

### `src/resources/`

Convention-based assets folder. The build handles each subfolder by name — no config props and no hardcoded per-type paths:

- `src/resources/icons/` — palette icons named to match the node type (`{type}.svg` or `{type}.png`). Each icon is inlined into its node definition and copied to `dist/icons/`.
- `src/resources/locales/labels/{node}/{lang}.json` — translatable label and description strings for the editor UI.
- `src/resources/locales/docs/{node}/{lang}.md` (or `.html`) — manual help docs shown in the Node-RED info sidebar.
- Any other folder is copied verbatim to `dist/<folder>`. For example, `src/resources/examples/` ships to `dist/examples/`. Drop a new folder in and it ships — no prop needed.

The package-root `LICENSE` and `README` are always copied to `dist/`.

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
