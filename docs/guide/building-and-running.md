# Building & Running

## Development Mode

Start the dev server with:

```bash
pnpm vite dev
```

This will:

1. Build your server and client code
2. Launch a local Node-RED instance (URL printed in the terminal)
3. Watch for file changes and automatically rebuild + restart

Server-side changes trigger a full Node-RED restart. Client-side changes trigger a browser page reload. The flow editor state (your flow definitions) is preserved across restarts.

The editor is served under a path slug derived from your project folder name — e.g. `http://127.0.0.1:5173/my-nodes/` — so several `nrg dev` instances can run behind a single reverse proxy without their URLs colliding. Opening the bare root URL redirects to the slug. Set `server.slug` to override it (see [Plugin Options](#plugin-options)).

### Node-RED Settings

To customize the Node-RED runtime, create a `node-red.settings.ts` at the project root:

```typescript
import { defineRuntimeSettings } from "@bonsae/nrg";

export default defineRuntimeSettings({
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
        // defaults to the slugified project folder name
        slug: "my-nodes",
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
| `server` | — | Dev server options (Node-RED launcher, editor path slug) |
| `build` | — | Production build options (output dir, server/client bundles, copies) |

### `ServerOptions` (the `server` group)

| Option | Default | Description |
| --- | --- | --- |
| `nodeRed` | — | Options for the Node-RED dev server launcher (see [`NodeRedLauncherOptions`](#noderedlauncheroptions)) |
| `slug` | slugified folder name | URL-safe path the editor is mounted under — `http://host:port/<slug>/`. Must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; an invalid value is rejected rather than rewritten |

### `BuildOptions` (the `build` group)

| Option | Default | Description |
| --- | --- | --- |
| `outDir` | `"./dist"` | Output directory for the built Node-RED package |
| `server` | — | Options for building the server-side node runtime (see [`ServerBuildOptions`](#serverbuildoptions)) |
| `client` | — | Options for building the client-side editor UI (see [`ClientBuildOptions`](#clientbuildoptions)) |
| `extraFilesCopyTargets` | `[]` | Extra files to copy into the output directory (e.g., LICENSE, README) |

### `ServerBuildOptions`

| Option | Default | Description |
| --- | --- | --- |
| `srcDir` | `"./src/server"` | Source directory for server code |
| `entry` | `"index.ts"` | Entry filename relative to `srcDir` |
| `format` | `"esm"` | Output format (`"esm"` builds to `.mjs` with a CJS bridge, `"cjs"` builds to `.js`) |
| `bundled` | `[]` | Dependencies to bundle into the output instead of keeping as external |
| `types` | `true` | Generate rolled-up `.d.ts` type declarations (production only) |
| `nodeTarget` | `"node22"` | esbuild target for the server bundle |
| `plugins` | `[]` | Additional Vite plugins for the server build |

### `ClientBuildOptions`

| Option | Default | Description |
| --- | --- | --- |
| `srcDir` | `"./src/client"` | Source directory for client code |
| `entry` | `"index.ts"` | Entry filename relative to `srcDir` |
| `nodesSubdir` | `"nodes"` | Subdirectory name for node definition files |
| `nodeFilePattern` | — | Pattern to match node definition files |
| `name` | `"NodeRedNodes"` | Global variable name for the UMD/IIFE bundle |
| `format` | `"es"` | Output format for the client bundle (`"es"`, `"iife"`, or `"umd"`) |
| `base` | — | Base public path for serving resources |
| `licensePath` | `"./LICENSE"` | Path to LICENSE file to include in the HTML output |
| `locales` | — | Internationalization options (see below) |
| `staticDirs.icons` | `"./src/icons"` | Directory containing node icons |
| `staticDirs.public` | `"./src/client/public"` | Directory for public static files copied to `dist/resources/` |
| `external` | `["jquery", "node-red", "vue", "@bonsae/nrg/client"]` | Modules to treat as external (not bundled) |
| `globals` | — | Global variable mappings for external modules |
| `manualChunks` | — | Custom chunk splitting function for Rollup |
| `plugins` | `[]` | Additional Vite plugins for the client build |

### `LocalesOptions`

| Option | Default | Description |
| --- | --- | --- |
| `docsDir` | `"./src/locales/docs"` | Directory containing documentation files (`{type}/{lang}.md` or `.html`) |
| `labelsDir` | `"./src/locales/labels"` | Directory containing label files (`{type}/{lang}.json`) |

Supported languages: `en-US`, `de`, `es-ES`, `fr`, `ko`, `pt-BR`, `ru`, `ja`, `zh-CN`, `zh-TW`.

### `NodeRedLauncherOptions`

| Option | Default | Description |
| --- | --- | --- |
| `runtime.port` | `1880` | Port for Node-RED to listen on |
| `runtime.settingsFilepath` | `"./node-red.settings.ts"` | Path to the Node-RED settings file (TypeScript supported) |
| `runtime.version` | `"latest"` | Node-RED version to install for the dev server |
| `restartDelay` | `1000` | Delay in ms before restarting Node-RED after a file change |
| `args` | `[]` | Additional CLI arguments passed to the Node-RED process |
