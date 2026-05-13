# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) **>= 22**
- [pnpm](https://pnpm.io/) **>= 10.11.0**

## Scaffold from Template

The fastest way to start is with the official scaffolding command:

```bash
pnpm create @bonsae/nrg my-node-red-nodes
cd my-node-red-nodes
```

Then start the dev server:

```bash
pnpm vite dev
```

Open the URL printed by Vite in the terminal and you'll see your custom node in the Node-RED palette.

## Manual Setup

If you prefer to add NRG to an existing project:

### 1. Install dependencies

```bash
pnpm add @bonsae/nrg
pnpm add -D vite vue
```

::: info Why is `vue` a dev dependency?
`@bonsae/nrg` already ships Vue as a runtime dependency and serves the Vue browser build to the Node-RED editor automatically — your project does not bundle or deploy Vue itself. However, `vue` must also be installed in your project as a dev dependency for two reasons:

1. **Editor autocompletion** — NRG ships `.d.ts` type declarations for its built-in form components (`NodeRedInput`, `NodeRedTypedInput`, etc.). These declarations reference `import("vue").DefineComponent` to provide prop autocompletion and type-checking in your `.vue` templates. The Vue Language Server (Volar) needs `vue` installed in your project's `node_modules` to resolve these types. Without it, all component types resolve to `any` and you lose autocompletion.

2. **pnpm strict isolation** — pnpm does not hoist transitive dependencies to the root `node_modules`. Even though `@bonsae/nrg` has `vue` in its own dependencies, Volar cannot see it because it resolves types from your project root, not from inside `@bonsae/nrg`'s isolated dependency tree. Adding `vue` as a dev dependency makes it directly visible.

This is only needed during development. The `vue` package is not included in your published Node-RED node package.
:::

### 2. Configure Vite

Create a `vite.config.ts` at the project root:

```typescript
import { defineConfig } from "vite";
import { nodeRed } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nodeRed()],
});
```

### 3. Configure TypeScript

Create `tsconfig.json` files that extend the shared configs:

**tsconfig.json** (root)

```json
{
  "extends": "@bonsae/nrg/tsconfig/base.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["vite.config.ts"]
}
```

**src/server/tsconfig.json**

```json
{
  "extends": "@bonsae/nrg/tsconfig/server.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["**/*.ts"]
}
```

**src/client/tsconfig.json** (only needed if you add custom client files)

```json
{
  "extends": "@bonsae/nrg/tsconfig/client.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["**/*.ts", "**/*.vue"]
}
```

::: tip
The `src/client/` directory and its `tsconfig.json` are optional. NRG auto-generates the client-side code from your server schemas. You only need these if you want to customize the editor behavior or provide custom Vue form components. See [Creating a Node](./creating-a-node#_4-client-side-files-all-optional) for details.
:::

### 4. Create the entry files

Create the server and client entry points. See the [Project Structure](./project-structure) page for the full layout, and [Creating a Node](./creating-a-node) for a complete walkthrough.

**src/server/index.ts**

```typescript
import { defineModule } from "@bonsae/nrg/server";
import MyNode from "./nodes/my-node";

export default defineModule({
  nodes: [MyNode],
});
```

**src/client/index.ts**

```typescript
import { registerTypes } from "@bonsae/nrg/client";
import myNode from "./nodes/my-node";

await registerTypes([myNode]);
```

### 5. Start developing

```bash
pnpm vite dev
```

This launches a local Node-RED instance with your nodes pre-installed. Changes to server or client code trigger automatic rebuilds and restarts.
