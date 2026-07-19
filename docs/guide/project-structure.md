# Project Structure

An NRG project uses a fixed folder layout. You register your node classes explicitly (in the server and client `index.ts` files), but the build finds icons, help text, forms, and schemas by matching their file name to a node's `type`. So for those files, the folder and file names below must match the node type exactly.

```
my-node-red-nodes/
├── vite.config.ts                 # Vite + nrg() plugin
├── tsconfig.json                  # Root TypeScript config (references)
├── package.json
├── node-red.settings.ts           # Optional Node-RED runtime settings
├── src/
│   ├── shared/
│   │   └── schemas/
│   │       └── {type-id}.ts       # TypeBox schema — server-value, client-type-only
│   ├── server/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/lib/server.json
│   │   ├── index.ts               # Server entry — export default defineModule({ nodes: [...] })
│   │   └── nodes/
│   │       └── {type-id}.ts       # Node class (extends IONode/ConfigNode)
│   ├── client/
│   │   ├── tsconfig.json          # Extends @bonsae/nrg/tsconfig/lib/client.json
│   │   ├── index.ts               # Client entry — registerTypes([...])
│   │   ├── public/                # Static files copied to dist/resources/
│   │   ├── nodes/
│   │   │   └── {type-id}.ts       # Client node definition (defineNode)
│   │   └── components/
│   │       └── {type-id}.vue      # Vue 3 SFC for the editor form (optional)
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

The entry file (`index.ts`) default-exports `defineModule({ nodes: [...] })`, listing all node classes.

### `src/client/`

Contains the browser-side code that registers nodes with the Node-RED editor. Each file in `nodes/` calls `defineNode()` to set a node's editor behavior — category, color, form component, and so on.

The entry file (`index.ts`) calls `registerTypes()` with all node definitions.

### `src/client/components/`

Optional Vue 3 single-file components (`.vue`) used as custom editor forms. By default NRG builds a node's editor form automatically from its schema; if you add a `{type}.vue` file here, NRG uses your custom form for that node instead of the generated one. Helper components like `<NodeRedInput>`, `<NodeRedTypedInput>`, and `<NodeRedConfigInput>` are available for building it.

### `src/shared/schemas/`

A schema (built with TypeBox) describes the shape of a node's config, credentials, input, and outputs. It is used two ways. The server imports it as real code to validate messages at runtime. The client imports only its *types* (`import type`) to type the editor form. Schemas live in `src/shared/schemas/`; a server node imports its own schema with `import ... from "@/schemas/{type}"` (the `@/schemas` alias points at this folder).

TypeBox is a Node-only library, so it must never end up in the browser bundle. That is why the client may only use `import type` on a schema — it borrows the types at compile time but imports no runtime code. At runtime the editor form is instead built from a serialized (plain-JSON) copy of the schema that the build injects for it. The boundary lint rule enforces this (client value-imports of `**/schemas/**` are an error; `import type` is allowed).

The rule also works the other way: a schema may only **`import type`** from `**/server/**`. Since each server node *value*-imports its own schema, if a schema imported server code back as real code you'd get a loop (server node ⇄ schema), and the server runtime would leak into the editor bundle. To reference a config node without that loop, use `SchemaType.NodeRef<T>("type")`: it takes the node's `type` string at runtime and the class only as a type. This is enforced by the `@bonsae/nrg/schema-server-imports-type-only` rule shipped in `nrg` (`@bonsae/nrg/eslint`). Both rules match by path (`**/schemas/**`), so they apply wherever the schemas live.

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

The `index.d.ts` file holds auto-generated server-side type declarations. NRG runs TypeScript's own declaration emit over your node classes (plus shared schemas) and rolls the result up with API Extractor — your own types are inlined, external `node_modules` types stay externalized. The resulting `index.d.ts` contains two things:

- **Inheritable node classes** — each node is emitted as a type-only class declaration with all its type parameters filled in, so another package can `import { MyNode }` and write `class Extended extends MyNode {}` to build on it.
- **The module default** — `{ nodes: [...] }`, typed from the classes above.

Consumers import these when they reference your schemas or node definitions from their own code. See [Building & Running](./building-and-running#production-build) for details on the build process.
