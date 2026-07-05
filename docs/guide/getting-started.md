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

Scaffolded projects expose `pnpm dev` and `pnpm build`, which run `vite dev` and `vite build`. Open the URL printed by Vite in the terminal and you'll see your custom node in the Node-RED palette.

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
  "extends": "@bonsae/nrg/tsconfig/lib/server.json",
  "compilerOptions": {
    "rootDir": ".."
  },
  "include": ["**/*.ts"]
}
```

**src/client/tsconfig.json** (only needed if you add custom client files)

```json
{
  "extends": "@bonsae/nrg/tsconfig/lib/client.json",
  "compilerOptions": {
    "rootDir": ".."
  },
  "include": ["**/*.ts", "**/*.vue"]
}
```

Node schemas live in `src/shared/schemas/`, imported via the `@/schemas` alias (shipped in NRG's base tsconfig, build, and test configs): the server plane value-imports them, while the client imports only their _types_. The `rootDir: ".."` roots each plane at `src/`, so a client tsconfig can still type-check the `src/shared` schema types its forms import.

::: tip
The `src/client/` directory and its `tsconfig.json` are optional. NRG auto-generates the client-side code from your schemas. You only need these if you want to customize the editor behavior or provide custom Vue form components. See [Creating a Node](./creating-a-node#client-side-files) for details.
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

### 5. Configure ESLint

`nrg` is a complete, drop-in flat config — the recommended JS/TS/Vue rules, NRG's plane boundaries, and a Prettier reset, all included. Your entire `eslint.config.js` is one line of config:

```js
import { nrg } from "@bonsae/nrg/eslint";

export default nrg;
```

Need to change a default? It's an array, and later flat-config blocks win, so append your own:

```js
import { nrg } from "@bonsae/nrg/eslint";

export default [
  ...nrg,
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
];
```

Then add a `lint` script (see [package.json scripts](#_6-add-package-json-scripts) below). Among other things, `nrg` enforces NRG's plane boundaries in-editor: client code may only `import type` from server or schema modules (keeping the node runtime out of the editor bundle), and the `@bonsae/nrg/schema-server-imports-type-only` rule keeps your schema modules from value-importing your own `server/` directory.

### 6. Add package.json scripts

Wire up the same scripts the scaffold provides so you can run the short commands:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "lint": "eslint .",
    "validate": "pnpm validate:tsc && pnpm validate:lint && pnpm validate:format",
    "validate:tsc": "tsc --build",
    "validate:lint": "eslint .",
    "validate:format": "prettier --check ."
  }
}
```

### 7. Start developing

The entry above imports `./nodes/my-node`, so create at least one node first — otherwise the build fails on the unresolved import. See [Creating a Node](./creating-a-node) for a complete walkthrough, then start the dev server:

```bash
pnpm dev
```

With the scripts from step 6 in place, `pnpm dev` runs `vite dev` just like a scaffolded project — if you skip those scripts, run `pnpm vite dev` directly.

This launches a local Node-RED instance with your nodes pre-installed. Any change to server or client code triggers an automatic rebuild and a full Node-RED restart; refresh the browser to see it. There's no hot module replacement yet, but your flows are preserved across restarts.
