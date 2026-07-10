# Building & Running

## Development Mode

Start the dev server with:

```bash
pnpm vite dev
```

This will:

1. Build your server and client code into the `.nrg/` folder.
2. Launch a local Node-RED instance (URL printed in the terminal)
3. Watch for file changes and automatically rebuild + restart

`.nrg/` is a gitignored dev folder — it is not `dist/`, which only `pnpm vite build` writes for publishing.

In dev mode your code imports `@bonsae/nrg` directly, so everything runs locally with nothing extra to install. (The production build swaps this for a smaller runtime package — see "Why your built node depends on `@bonsae/nrg-runtime`" below.)

Every change — server or client — triggers a full Node-RED restart, **not** hot module replacement (HMR). Vite handles the restart; you refresh the browser to load the rebuilt editor and client forms. If you have a node's edit panel open when a restart happens, any unsaved changes in that panel are cleared — but your deployed flows themselves are kept.

### Node-RED Settings

To customize the Node-RED runtime, create a `node-red.settings.ts` at the project root:

```typescript
import { defineNodeRedSettings } from "@bonsae/nrg/vite";

export default defineNodeRedSettings({
  flowFile: "flows.json",
  flowFilePretty: true,
  credentialSecret: false,
  logging: {
    console: {
      level: "info",
    },
  },
});
```

## Production Build

Build the distributable package with:

```bash
pnpm vite build
```

The output goes to the `dist/` directory:

```
dist/
├── package.json                    # Generated, ready for npm publish
├── index.js                        # CJS bridge (requires index.mjs)
├── index.mjs                       # ESM server bundle
├── index.d.ts                      # TypeScript declarations
├── index.html                      # Client HTML with resource links
├── resources/
│   ├── index.[hash].js             # Client bundle
│   ├── vendor.[hash].js            # Vendor dependencies
│   └── [name].[hash].[ext]         # Other assets (fonts, images, etc.)
├── icons/
│   └── my-node.png                 # Palette icons
└── locales/
    ├── en-US/
    │   ├── index.html              # Help sidebar docs
    │   └── index.json              # Label translations
    ├── de/
    ├── es-ES/
    ├── fr/
    └── ...                         # Other configured languages
```

### Debugging a production build

The **server bundle (`index.mjs`) is intentionally not minified**. Node-RED loads it
locally with `require()` — it is never sent to a browser — so readable code is worth
more than a smaller file. The payoff: a production stack trace shows real function
names and line numbers in `index.mjs`, so you can trace an error without a source map
(which is why none is emitted for the server).

For step-through debugging against your original TypeScript, use **dev mode**
(`pnpm vite dev`): it builds unminified with accurate inline source maps and a live
Node-RED — reproduce the issue there.

The **client bundle** (`resources/*.[hash].js`) _is_ minified — the editor downloads
it, so size matters. Its filename includes a hash of its contents, which changes every
release, so a browser can never reuse an old cached copy.

### Why your built node depends on `@bonsae/nrg-runtime`

The generated `dist/package.json` declares a dependency on **`@bonsae/nrg-runtime`**,
not `@bonsae/nrg`. You never add this yourself — NRG does it for you. Why are there
two packages?

- **`@bonsae/nrg`** is the authoring toolkit — the Vite plugin, test utilities, and
  build/dev tooling (`vite`, `esbuild`, `typescript`, …). You install it as a
  **devDependency**; it must never end up in the Node-RED container.
- **`@bonsae/nrg-runtime`** is the minimal runtime a node needs to _run_ (node base
  classes, schemas, the AJV validator, the editor client runtime) — `ajv`/`typebox`/
  `vue`, no build tooling.

During `vite build`, NRG swaps your `@bonsae/nrg/server` and `@bonsae/nrg/schema`
imports for `@bonsae/nrg-runtime` in the emitted bundle and declares only that
dependency, so installing your node in Node-RED pulls the small runtime and none of
the tooling. You never reference `@bonsae/nrg-runtime` yourself: you get it
automatically when you install `@bonsae/nrg`, and the two are published together at
the same version, so it always installs cleanly.

## Installing in Node-RED

### Local install

```bash
cd ~/.node-red
npm install /path/to/my-node-red-nodes/dist
```

### npm link (for development)

```bash
cd /path/to/my-node-red-nodes/dist
npm link

cd ~/.node-red
npm link your-package-name
```

### Publish to npm

```bash
cd dist
npm publish
```

Then install in Node-RED via the palette manager or:

```bash
cd ~/.node-red
npm install your-package-name
```

## Plugin Options

The `nrg()` Vite plugin accepts an optional configuration object, grouped into `server` (dev server) and `build` (production bundle):

```typescript
import { defineConfig } from "vite";
import { nrg } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [
    nrg({
      server: {
        nodeRed: {
          runtime: {
            port: 1880,
            settingsFilepath: "./node-red.settings.ts",
            version: "latest",
          },
          restartDelay: 1000,
        },
      },
      build: {
        outDir: "./dist",
        server: {
          srcDir: "./src/server",
          entry: "index.ts",
          format: "esm",
          nodeTarget: "node22",
          types: true,
        },
        client: {
          srcDir: "./src/client",
          entry: "index.ts",
          format: "es",
        },
      },
    }),
  ],
});
```

### `NrgPluginOptions`

| Option | Default | Description |
| --- | --- | --- |
| `server` | — | Dev server options (Node-RED launcher) |
| `build` | — | Production build options (output dir, server/client bundles, copies) |

### `ServerOptions` (the `server` group)

| Option | Default | Description |
| --- | --- | --- |
| `nodeRed` | — | Options for the Node-RED dev server launcher (see [`NodeRedLauncherOptions`](#noderedlauncheroptions)) |
| `verbose` | `false` | Print every dependency build warning in full instead of collapsing the non-actionable ones into a single summary line |

### `BuildOptions` (the `build` group)

| Option | Default | Description |
| --- | --- | --- |
| `outDir` | `"./dist"` | Output directory for the built Node-RED package |
| `server` | — | Options for building the server-side node runtime (see [`ServerBuildOptions`](#serverbuildoptions)) |
| `client` | — | Options for building the client-side editor UI (see [`ClientBuildOptions`](#clientbuildoptions)) |

### `ServerBuildOptions`

| Option | Default | Description |
| --- | --- | --- |
| `srcDir` | `"./src/server"` | Source directory for server code |
| `entry` | `"index.ts"` | Entry filename relative to `srcDir` |
| `format` | `"esm"` | Output format (`"esm"` builds to `.mjs` with a CJS bridge, `"cjs"` builds to `.js`) |
| `external` | `[]` | Packages to keep as external (not bundled) |
| `bundled` | `[]` | Dependencies to bundle into the output instead of keeping as external |
| `types` | `true` | Generate rolled-up `.d.ts` type declarations (production only) |
| `nodeTarget` | `"node22"` | esbuild target for the server bundle |

### `ClientBuildOptions`

| Option | Default | Description |
| --- | --- | --- |
| `srcDir` | `"./src/client"` | Source directory for client code |
| `entry` | `"index.ts"` | Entry filename relative to `srcDir` |
| `name` | `"NodeRedNodes"` | Global variable name for the UMD/IIFE bundle |
| `format` | `"es"` | Output format for the client bundle (`"es"`, `"iife"`, or `"umd"`) |
| `licensePath` | `"./LICENSE"` | Path to LICENSE file to include in the HTML output |
| `publicDir` | `"./src/client/public"` | Directory for public static files copied to `dist/resources/` |
| `external` | `["jquery", "node-red", "vue", "@bonsae/nrg/client"]` | Modules to treat as external (not bundled) |
| `globals` | `{ jquery: "$", "node-red": "RED", vue: "Vue" }` | Global variable mappings for external modules |
| `manualChunks` | — | Custom chunk splitting function for Rollup |

### Node resources (icons, locales, examples)

Node icons, editor labels/descriptions, help docs, and example flows are not
configured here — they're handled automatically by the `src/resources/`
convention, with no build options. Drop files into the right subfolder and they
ship:

- `src/resources/icons/` — node icons named `{type}.svg` or `{type}.png`
- `src/resources/locales/labels/{node}/{lang}.json` — editor labels & descriptions
- `src/resources/locales/docs/{node}/{lang}.md` (or `.html`) — Node-RED info-panel help
- any other folder (e.g. `src/resources/examples/`) is copied verbatim to `dist/<folder>`

See the [Project Structure](./project-structure) and [Locales](./locales) guides for
details. Supported languages: `en-US`, `de`, `es-ES`, `fr`, `ko`, `pt-BR`, `ru`,
`ja`, `zh-CN`, `zh-TW`.

### `NodeRedLauncherOptions`

| Option | Default | Description |
| --- | --- | --- |
| `runtime.port` | `1880` | Port for Node-RED to listen on |
| `runtime.settingsFilepath` | `"./node-red.settings.ts"` | Path to the Node-RED settings file (TypeScript supported) |
| `runtime.version` | `"latest"` | Node-RED version to install for the dev server |
| `restartDelay` | `1000` | Delay in ms before restarting Node-RED after a file change |
| `args` | `[]` | Additional CLI arguments passed to the Node-RED process |
