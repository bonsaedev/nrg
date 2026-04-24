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
pnpm add @bonsae/nrg @sinclair/typebox vue
pnpm add -D vite
```

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
import MyNode from "./nodes/my-node";

export default {
  nodes: [MyNode],
};
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
