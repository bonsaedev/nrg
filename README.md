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

## Quick Start

```bash
pnpm add @bonsae/nrg
pnpm add -D vite vue node-red
```

> `vite` and `vue` are dev dependencies because they are only needed at build time. Vue is included as a dependency of nrg and served automatically at runtime.

### Node-RED Resolution

The vite plugin needs a Node-RED instance for the dev server. It resolves it in this order:

1. **`runtime.version`** — if specified in the plugin config, downloads that exact version via `npx` (overrides any locally installed version)
2. **Local `node_modules`** — if `node-red` is installed as a dependency, it is used directly (fastest)
3. **Fallback** — downloads the latest `node-red` via `npx`

Installing `node-red` as a dev dependency is recommended for fast, reliable dev server startup across all platforms (especially Windows). If you need a specific version (e.g., a beta), set `runtime.version` in the plugin config instead.

**vite.config.ts**

```typescript
import { defineConfig } from "vite";
import { nrg } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nrg()],
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

export default class MyNode extends IONode<Config, never, Input, Output> {
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

NRG provides four test libraries and bundles most test infrastructure as direct dependencies. Install `vitest` plus any optional peer dependencies you need:

```bash
pnpm add -D vitest
```

Optional peer dependencies:

| Package                      | When to install                                              |
| ---------------------------- | ------------------------------------------------------------ |
| `@vitest/browser-playwright` | Component tests (Playwright browser provider for Vitest)     |
| `playwright`                 | Component tests or E2E tests (direct `import` in test files) |
| `vitest-browser-vue`         | Component tests (`render` helper for Vue components)         |
| `@vitest/coverage-v8`        | Coverage with `--coverage` (V8 provider)                     |
| `@vitest/coverage-istanbul`  | Coverage with `--coverage` (Istanbul provider)               |

- `@bonsae/nrg/test/server/unit` — server-side unit tests
- `@bonsae/nrg/test/client/unit` — client-side unit tests (TypeScript logic)
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

### Client Unit Tests

Test client-side TypeScript logic (validation, utilities) with mocked `RED` and `$` globals:

```typescript
// vitest.client.unit.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { defaultConfig } from "@bonsae/nrg/test/client/unit/config";

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      include: ["tests/client/unit/**/*.test.ts"],
    },
  }),
);
```

```typescript
// tests/client/unit/my-util.test.ts
import { describe, it, expect } from "vitest";
import { myUtil } from "../src/client/my-util";

describe("myUtil", () => {
  it("works with RED globals", () => {
    expect(myUtil("input")).toBe("expected");
  });
});
```

### Client Component Tests

Test your Vue editor components with mocked Node-RED globals. Components that use `useFormNode()` receive their node data via Vue's `provide`/`inject` — use `createNode().provide` to supply it in tests:

```typescript
// vitest.client.component.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { defaultConfig } from "@bonsae/nrg/test/client/component/config";

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      include: ["tests/client/component/**/*.test.ts"],
    },
  }),
);
```

```typescript
// tests/client/component/my-form.test.ts
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { createNode } from "@bonsae/nrg/test/client/component";
import MyForm from "../src/client/components/my-form.vue";

describe("MyForm", () => {
  test("renders fields from injected node", async () => {
    const { provide } = createNode({
      name: "test",
      url: "https://example.com",
    });
    const screen = render(MyForm, {
      global: { provide },
    });
    await expect.element(screen.getByDisplayValue("test")).toBeInTheDocument();
  });

  test("accesses node id for API calls", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);
    const { node, provide } = createNode({ name: "test" });
    render(MyForm, { global: { provide } });
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(`my-api/${node.id}`);
    });
  });

  test("asserts RED.editor API calls", async () => {
    const { RED, provide } = createNode();
    render(MyForm, { global: { provide } });
    expect(RED.editor.createEditor).toHaveBeenCalled();
  });
});
```

See the [testing guide](https://bonsaedev.github.io/nrg/guide/testing) for full API reference.

## Development

```bash
pnpm install
pnpm build                        # build all (server, client, vite plugin, test libs)
pnpm validate                     # type-check + lint + format check
pnpm validate:tsc                 # type-check all tsconfigs
pnpm validate:lint                # eslint
pnpm validate:format              # prettier check
pnpm test                         # run all tests
pnpm test:core:server:unit        # server unit tests
pnpm test:core:client:unit        # client unit tests
pnpm test:core:client:component   # client component tests
pnpm test:core:client:e2e         # client E2E tests
pnpm docs:dev                     # start docs dev server
```

## License

MIT
