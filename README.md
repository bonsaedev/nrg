<p align="center">
  <img alt="nrg-icon" src="https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/0c9cdb994c40ab3d7b7ad06dcee162145d77d531/nrg-icon.svg" style="width: 200px"/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bonsae/nrg"><img src="https://img.shields.io/npm/v/@bonsae/nrg.svg" alt="npm package"></a>
  <a href="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml"><img src="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://codecov.io/gh/bonsaedev/nrg"><img src="https://codecov.io/gh/bonsaedev/nrg/graph/badge.svg" alt="codecov"/></a>
  <a href="https://socket.dev/npm/package/@bonsae/nrg"><img src="https://badge.socket.dev/npm/package/@bonsae/nrg?v=1" alt="Socket Badge"></a>
</p>

# nrg

Build Node-RED nodes with Vue 3, TypeScript, JSON Schema validations, Vite and Vitest.

## Package Exports

| Export                               | Description                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bonsae/nrg`                        | Root entry — `defineRuntimeSettings`                                                                                                                                  |
| `@bonsae/nrg/server`                 | Server node classes, schema utilities, validation (`IONode`, `ConfigNode`, `defineIONode`, `defineConfigNode`, `defineModule`, `SchemaType`, `defineSchema`, `Infer`) |
| `@bonsae/nrg/client`                 | Client-side registration (`registerTypes`, `defineNode`)                                                                                                              |
| `@bonsae/nrg/vite`                   | Vite plugin for building and developing Node-RED packages                                                                                                             |
| `@bonsae/nrg/test/server/unit`       | Server-side unit test helpers (`createNode`, `createRED`, `MockRED`)                                                                                                  |
| `@bonsae/nrg/test/client/unit`             | Client unit test config and mocks (`defaultConfig`, `createRED`, `createJQuery`)                                                                                      |
| `@bonsae/nrg/test/client/unit/setup`       | Setup file that installs `RED` and `$` mocks on `window`                                                                                                              |
| `@bonsae/nrg/test/client/component`        | Client component test helpers (`createNode`, `defaultConfig`, `createRED`, `createJQuery`)                                                                             |
| `@bonsae/nrg/test/client/component/setup`  | Setup file that installs `RED` and `$` mocks on `window` and configures Vue i18n                                                                                      |
| `@bonsae/nrg/test/client/e2e`              | Browser E2E test helpers (`NodeRedEditor`, `NodeRedField`)                                                                                                             |
| `@bonsae/nrg/tsconfig/*`             | Shared TypeScript configurations for consumers                                                                                                                        |

## Quick Start

```bash
# In your Node-RED package project
pnpm add @bonsae/nrg
pnpm add -D vite vue
```

> `vite` and `vue` are dev dependencies because they are only needed at build time. Vue is included as a dependency of nrg and served automatically at runtime.

**vite.config.ts**

```typescript
import { defineConfig } from "vite";
import { nodeRed } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nodeRed()],
});
```

**src/server/schemas/my-node.ts**

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/server";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    prefix: SchemaType.String({ default: "hello" }),
  },
  { $id: "my-node:configs" },
);
```

**src/server/nodes/my-node.ts**

NRG supports two ways to define nodes:

<table>
<tr><th>Functional API</th><th>Class API</th></tr>
<tr><td>

```typescript
import { defineIONode, SchemaType } from "@bonsae/nrg/server";
import { ConfigsSchema, InputSchema, OutputSchema } from "../schemas/my-node";

export default defineIONode({
  type: "my-node",
  color: "#ffffff",
  configSchema: ConfigsSchema,
  inputSchema: InputSchema,
  outputsSchema: OutputSchema,

  async input(msg) {
    msg.payload = `${this.config.prefix}: ${msg.payload}`;
    this.send(msg);
  },
});
```

</td><td>

```typescript
import { IONode, type Schema, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema, InputSchema, OutputSchema } from "../schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;
type Input = Infer<typeof InputSchema>;
type Output = Infer<typeof OutputSchema>;

export default class MyNode extends IONode<Config, any, Input, Output> {
  static readonly type = "my-node";
  static readonly category = "function";
  static readonly color: `#${string}` = "#ffffff";
  static readonly configSchema: Schema = ConfigsSchema;
  static readonly inputSchema: Schema = InputSchema;
  static readonly outputsSchema: Schema = OutputSchema;

  async input(msg: Input) {
    this.send({ payload: `${this.config.prefix}: ${msg.payload}` });
  }
}
```

</td></tr>
<tr>
<td>Automatic type inference, less boilerplate</td>
<td>Custom methods, inheritance, mixins</td>
</tr>
</table>

**src/server/index.ts**

```typescript
import { defineModule } from "@bonsae/nrg/server";
import MyNode from "./nodes/my-node";

export default defineModule({
  nodes: [MyNode],
});
```

See the [consumer template](https://github.com/AllanOricil/node-red-vue-template) for a complete example.

## Testing

NRG provides three test libraries:

- `@bonsae/nrg/test/server/unit` — server-side unit tests
- `@bonsae/nrg/test/client/component` — client component tests (Vue + browser)
- `@bonsae/nrg/test/client/e2e` — browser E2E tests (Playwright)

### Server Unit Tests

```typescript
import { describe, it, expect } from "vitest";
import { createNode } from "@bonsae/nrg/test/server/unit";
import MyNode from "../src/server/nodes/my-node";

describe("my-node", () => {
  it("should process messages", async () => {
    const { node } = await createNode(MyNode, {
      config: { greeting: "hello" },
    });

    await node.receive({ payload: "world" });

    expect(node.sent(0)).toEqual([{ payload: "hello world" }]);
  });
});
```

### Client Component Tests

Test your Vue editor components with mocked Node-RED globals:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";
import { defaultConfig } from "@bonsae/nrg/test/client/component";

export default defineConfig({
  plugins: [vue()],
  test: {
    ...defaultConfig,
    browser: {
      ...defaultConfig.browser,
      provider: playwright(),
    },
  },
});
```

```typescript
// tests/my-component.test.ts
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { createNode } from "@bonsae/nrg/test/client/component";
import MyComponent from "../src/client/components/my-component.vue";

describe("MyComponent", () => {
  test("renders with node props", async () => {
    const { node } = createNode({ name: "test" });
    const screen = render(MyComponent, {
      props: { node },
    });
    await expect.element(screen.getByText("test")).toBeInTheDocument();
  });

  test("calls RED.editor API", async () => {
    const { node, RED } = createNode();
    render(MyComponent, { props: { node, value: "" } });
    expect(RED.editor.createEditor).toHaveBeenCalled();
  });
});
```

See the [testing guide](https://bonsaedev.github.io/nrg/guide/testing) for full API reference.

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
