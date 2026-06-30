# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) **>= 20.19**
- [pnpm](https://pnpm.io/) **>= 10.11.0**

## Scaffold from Template

The fastest way to start is with the official scaffolding command:

```bash
pnpm create @bonsae/nrg my-node-red-nodes
cd my-node-red-nodes
pnpm install
```

Then start the dev server:

```bash
pnpm dev
```

Open the URL printed by Vite in the terminal and you'll see your custom node in the Node-RED palette.

## Manual Setup

If you prefer to add NRG to an existing project:

### 1. Install dependencies

::: code-group

```bash [pnpm]
pnpm add -D @bonsae/nrg node-red vue vite vitest
```

```bash [npm]
npm install -D @bonsae/nrg node-red vue vite vitest
```

```bash [yarn]
yarn add -D @bonsae/nrg node-red vue vite vitest
```

:::

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
import { nrg } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nrg()],
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
  "extends": "@bonsae/nrg/tsconfig/core/server.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["**/*.ts"]
}
```

**src/client/tsconfig.json** (only needed if you add custom client files)

```json
{
  "extends": "@bonsae/nrg/tsconfig/core/client.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["**/*.ts", "**/*.vue"]
}
```

::: tip
The `src/client/` directory and its `tsconfig.json` are optional. NRG auto-generates the client-side code from your server schemas. You only need these if you want to customize the editor behavior or provide custom Vue form components. See [Creating a Node](./creating-a-node#client-side-files) for details.
:::

### 4. Create the entry file

Create the server entry point. See the [Project Structure](./project-structure) page for the full layout, and [Creating a Node](./creating-a-node) for a complete walkthrough.

**src/server/index.ts**

```typescript
import { defineModule } from "@bonsae/nrg/server";
import MyNode from "./nodes/my-node";

export default defineModule({
  nodes: [MyNode],
});
```

`defineModule` collects your node classes into a typed module manifest that NRG uses to register them with Node-RED.

::: tip No client code needed
NRG auto-generates all client-side code (editor forms, node registration, defaults) from your server schemas. You only need a `src/client/` directory if you want [custom editor behavior](./creating-a-node#client-side-files).
:::

### 5. Start developing

The entry above imports `./nodes/my-node`, so create at least one node first — otherwise the build fails on the unresolved import. See [Creating a Node](./creating-a-node) for a complete walkthrough, then start the dev server:

```bash
pnpm vite dev
```

This launches a local Node-RED instance with your nodes pre-installed. Any change to server or client code triggers an automatic rebuild and a full Node-RED restart; refresh the browser to see it. There's no hot module replacement yet, but your flows are preserved across restarts.
