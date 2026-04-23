<p align="center">
  <img alt="nrg-icon" src="https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/0c9cdb994c40ab3d7b7ad06dcee162145d77d531/nrg-icon.svg" style="width: 200px"/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bonsae/nrg"><img src="https://img.shields.io/npm/v/@bonsae/nrg.svg" alt="npm package"></a>
  <a href="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml"><img src="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml/badge.svg?branch=main" alt="build status"></a>
</p>

# nrg

Build Node-RED nodes with Vue 3, TypeScript, and JSON Schema validation.

## Install

```bash
pnpm add @bonsae/nrg @sinclair/typebox vue
pnpm add -D vite
```

## Package Exports

| Export | Description |
| --- | --- |
| `@bonsae/nrg/server` | Server node classes (`Node`, `IONode`, `ConfigNode`), schema utilities, validation |
| `@bonsae/nrg/client` | Vue 3 form components, client-side registration |
| `@bonsae/nrg/schemas` | TypeBox schema types (`Schema`, `Infer`, `SchemaType`) |
| `@bonsae/nrg/vite` | Vite plugin for building and developing Node-RED packages |
| `@bonsae/nrg/tsconfig/*` | Shared TypeScript configurations for consumers |

## Quick Start

```bash
# In your Node-RED package project
pnpm add @bonsae/nrg @sinclair/typebox vue
pnpm add -D vite
```

**vite.config.ts**

```typescript
import { defineConfig } from "vite";
import { nodeRed } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nodeRed()],
});
```

**src/server/index.ts**

```typescript
import MyNode from "./nodes/my-node";

export default {
  nodes: [MyNode],
};
```

**src/server/nodes/my-node.ts**

```typescript
import { IONode, type Schema, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/my-node";

export type Config = Infer<typeof ConfigsSchema>;

export default class MyNode extends IONode<Config> {
  static readonly type = "my-node";
  static readonly category = "function";
  static readonly color: `#${string}` = "#ffffff";
  static readonly inputs = 1;
  static readonly outputs = 1;
  static readonly configSchema: Schema = ConfigsSchema;

  async input(msg: any) {
    this.send(msg);
  }
}
```

See the [consumer template](https://github.com/AllanOricil/node-red-vue-template) for a complete example.

## Project Structure

```
src/
├── core/                        # Runtime framework
│   ├── client/                  # Vue 3 editor components
│   │   ├── app.vue              # Root form wrapper (validation, toggles)
│   │   ├── components/          # Reusable form inputs
│   │   │   ├── node-red-input.vue
│   │   │   ├── node-red-typed-input.vue
│   │   │   ├── node-red-config-input.vue
│   │   │   ├── node-red-select-input.vue
│   │   │   ├── node-red-editor-input.vue
│   │   │   └── node-red-json-schema-form.vue
│   │   └── index.ts             # registerType, defineNode
│   ├── server/                  # Node.js server runtime
│   │   ├── nodes/               # Node, IONode, ConfigNode classes
│   │   ├── schemas/             # TypeBox schema system
│   │   ├── types/               # RED, context store types
│   │   └── index.ts             # registerTypes, exports
│   ├── constants.ts
│   └── validator.ts             # AJV-based validation
├── vite/                        # Build tooling
│   ├── plugin.ts                # Vite plugin factory
│   ├── plugins/                 # Dev server, build orchestration
│   ├── server/                  # Server build (CJS/ESM + bridge)
│   ├── client/                  # Client build (Vue + auto-wiring)
│   └── index.ts                 # nodeRed(), defineRuntimeSettings()
└── tsconfig/                    # Shared configs for consumers
    ├── base.json
    ├── client.json
    └── server.json
```

## Development

```bash
pnpm install
pnpm build          # build all (server CJS, client ESM, vite plugin)
pnpm typecheck      # type-check server and client
pnpm lint           # eslint
pnpm format         # prettier
```

## License

MIT
