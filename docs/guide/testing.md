# Testing a Node

NRG provides three test libraries:

- `@bonsae/nrg/test/server/unit` — Unit/integration testing of **server-side logic** (lifecycle hooks, input/output, config, credentials, context stores)
- `@bonsae/nrg/test/client/unit` — Component testing of **editor UI components** with Vitest browser mode (Vue rendering, jQuery widgets, RED API interactions)
- `@bonsae/nrg/test/client/e2e` — E2E testing of **editor UI** with Playwright (form rendering, validation, typed inputs, config selectors)

## Server-Side Testing

### Setup

#### 1. Install Vitest

```bash
pnpm add -D vitest
```

#### 2. Add test script

Add a test script to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

#### 3. Add a test tsconfig

Create a `tsconfig.json` for your server tests that extends the NRG base config:

```json
// tests/server/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/server/unit.json",
  "include": ["**/*.ts", "../../src/server/**/*.ts"]
}
```

#### 4. Create a test file

Create your tests in a `tests/` directory (or anywhere — Vitest finds `*.test.ts` files automatically):

```
src/
  server/
    nodes/my-node.ts
tests/
  server/
    my-node.test.ts        ← test file
    tsconfig.json           ← extends @bonsae/nrg/tsconfig/test/server/unit.json
vitest.config.ts           ← optional
```

No special Vitest configuration is needed. Vitest picks up your existing `vite.config.ts` or runs with sensible defaults.

If you want a separate config for tests, create a `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

### Quick Start

```typescript
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

### API

#### `createNode(NodeClass, options?)`

Creates a fully initialized node instance with mocked RED and Node-RED internals. Calls `registered()` and `created()` automatically.

**Options:**

| Option        | Description                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `config`      | Node config object (merged with schema defaults). Config node instances can be passed directly as values and will be auto-registered. |
| `credentials` | Credentials object                                                                                                                    |
| `settings`    | `RED.settings` overrides                                                                                                              |
| `overrides`   | Low-level Node-RED node overrides (`id`, `wires`, etc.)                                                                               |

**Returns:** `{ node, RED }`

#### Node Test Helpers

Every node returned by `createNode` has these helpers:

| Method                 | Description                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `node.receive(msg)`    | Send a message through the node's `input()` handler                                   |
| `node.close(removed?)` | Trigger the `closed()` lifecycle hook                                                 |
| `node.reset()`         | Clear all captured sent messages, statuses, and logs                                  |
| `node.sent()`          | All raw messages passed to `send()`                                                   |
| `node.sent(port)`      | Messages sent to a specific output port                                               |
| `node.statuses()`      | All `status()` calls                                                                  |
| `node.logged(level?)`  | Log messages, optionally filtered by level (`"info"`, `"warn"`, `"error"`, `"debug"`) |
| `node.warned()`        | Warning messages                                                                      |
| `node.errored()`       | Error messages                                                                        |

### Examples

```typescript
import { describe, it, expect } from "vitest";
import { createNode } from "@bonsae/nrg/test/server/unit";
import { defineIONode, defineSchema, SchemaType } from "@bonsae/nrg/server";
import MyNode from "../src/server/nodes/my-node";
import Splitter from "../src/server/nodes/splitter";
import RemoteServer from "../src/server/nodes/remote-server";

describe("my-node", () => {
  it("should apply config defaults from schema", async () => {
    const { node } = await createNode(MyNode);
    expect(node.config.name).toBe("my-node");
  });

  it("should accept custom config", async () => {
    const { node } = await createNode(MyNode, {
      config: { greeting: "hi", timeout: 3000 },
    });
    expect(node.config.greeting).toBe("hi");
    expect(node.config.timeout).toBe(3000);
  });

  it("should process input and produce output", async () => {
    const { node } = await createNode(MyNode);
    await node.receive({ payload: "hello" });

    expect(node.sent(0)).toEqual([{ payload: "HELLO" }]);
    expect(node.statuses()[0]).toEqual({ fill: "green", text: "ok" });
  });

  it("should call registered() automatically", async () => {
    const { RED } = await createNode(MyNode);
    expect(RED.log.info).toHaveBeenCalledWith("my-node registered");
  });

  it("should call created() automatically", async () => {
    const { node } = await createNode(MyNode);
    expect(node.logged("info")).toContain("node created");
  });

  it("should support close lifecycle", async () => {
    const { node } = await createNode(MyNode);
    await node.close();
    expect(node.logged("info")).toContain("node closed");
  });

  it("should capture logs, warnings, and errors", async () => {
    const { node } = await createNode(MyNode);
    await node.receive({ payload: "test" });

    expect(node.logged("info")).toContain("processing test");
    expect(node.warned()).toHaveLength(0);
    expect(node.errored()).toHaveLength(0);
  });

  it("should reset captured state between assertions", async () => {
    const { node } = await createNode(MyNode);

    await node.receive({ payload: "a" });
    expect(node.sent()).toHaveLength(1);

    node.reset();

    expect(node.sent()).toHaveLength(0);
    expect(node.statuses()).toHaveLength(0);
    expect(node.logged()).toHaveLength(0);

    await node.receive({ payload: "b" });
    expect(node.sent()).toHaveLength(1);
  });
});

describe("credentials", () => {
  it("should pass credentials to the node", async () => {
    const { node } = await createNode(MyNode, {
      credentials: { apiKey: "secret-123" },
    });

    await node.receive({ payload: "test" });
    expect(node.sent(0)).toEqual([{ payload: "authenticated" }]);
  });
});

describe("settings", () => {
  it("should resolve settings from RED.settings", async () => {
    const { node } = await createNode(MyNode, {
      settings: { myNodeTimeout: 3000 },
    });

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: 3000 }]);
  });
});

describe("TypedInput", () => {
  // Given a node that resolves a TypedInput in its input handler:
  //
  //   async input(msg) {
  //     const value = await this.config.target.resolve(msg);
  //     this.send({ payload: value });
  //   }

  it("should resolve msg property via TypedInput", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "payload", type: "msg" } },
    });

    await node.receive({ payload: "from-msg" });
    expect(node.sent(0)).toEqual([{ payload: "from-msg" }]);
  });

  it("should resolve string literal via TypedInput", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "hello", type: "str" } },
    });

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: "hello" }]);
  });

  it("should resolve number via TypedInput", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "42", type: "num" } },
    });

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: 42 }]);
  });
});

describe("config node references", () => {
  it("should resolve NodeRef to config node instance", async () => {
    const { node: server } = await createNode(RemoteServer, {
      config: { host: "localhost", port: 3000 },
      overrides: { id: "server-1" },
    });

    const { node } = await createNode(MyNode, {
      config: { server: server },
    });

    expect(node.config.server.config.host).toBe("localhost");
  });
});

describe("multi-output nodes", () => {
  it("should route messages to different ports", async () => {
    const { node } = await createNode(Splitter, {
      config: { threshold: 50 },
    });

    await node.receive({ payload: 75 });
    await node.receive({ payload: 30 });

    expect(node.sent(0)).toEqual([{ payload: 75, label: "above" }]);
    expect(node.sent(1)).toEqual([{ payload: 30, label: "below" }]);
  });
});

describe("context store", () => {
  it("should persist values across triggers", async () => {
    const { node } = await createNode(MyNode);

    await node.receive({});
    await node.receive({});

    expect(node.sent(0)).toEqual([{ payload: 1 }, { payload: 2 }]);
  });
});

describe("error handling", () => {
  const ErrorNode = defineIONode({
    type: "error-test",
    inputSchema: SchemaType.Object({}),
    outputsSchema: SchemaType.Object({}),
    async input() {
      throw new Error("something broke");
    },
  });

  it("should reject when input throws", async () => {
    const { node } = await createNode(ErrorNode);

    await expect(node.receive({ payload: "bad" })).rejects.toThrow(
      "something broke",
    );
    expect(node.sent()).toHaveLength(0);
  });
});

describe("i18n", () => {
  it("should resolve labels with __placeholder__ substitution", async () => {
    const { node } = await createNode(MyNode);

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: "my-node.greeting" }]);
  });
});

describe("factory API", () => {
  it("should work with defineIONode", async () => {
    const FactoryNode = defineIONode({
      type: "factory-node",
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      input(msg) {
        this.send({ payload: msg.payload.toUpperCase() });
      },
    });

    const { node } = await createNode(FactoryNode);
    await node.receive({ payload: "hello" });
    expect(node.sent(0)).toEqual([{ payload: "HELLO" }]);
  });
});
```

## Client Component Testing

NRG provides a component test library at `@bonsae/nrg/test/client/unit` for testing your Vue editor components in a real browser environment. It uses [Vitest browser mode](https://vitest.dev/guide/browser/) to render components with mocked Node-RED editor globals, so you can test form rendering, widget interactions, and RED API calls without running a full Node-RED instance.

::: tip When to use
Use component tests to verify that individual Vue components render correctly, respond to props, and interact with the RED API. For full editor round-trip testing (deploy, edit, save), use `@bonsae/nrg/test/client/e2e` instead.
:::

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest vitest-browser-vue @vitest/browser-playwright @vitejs/plugin-vue
```

#### 2. Add a test tsconfig

```json
// tests/client/unit/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/client/unit.json",
  "include": [
    "**/*.ts",
    "../../../src/client/**/*.ts",
    "../../../src/client/**/*.vue"
  ]
}
```

#### 3. Create a Vitest config

```typescript
// vitest.client.unit.config.ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";
import { defaultConfig } from "@bonsae/nrg/test/client/unit";

export default defineConfig({
  plugins: [vue()],
  test: {
    ...defaultConfig,
    include: ["tests/client/unit/**/*.test.ts"],
    browser: {
      ...defaultConfig.browser,
      provider: playwright(),
    },
  },
});
```

The `defaultConfig` provides:

- `testTimeout: 30_000`
- `setupFiles` pointing to the built-in setup that installs `$` and `RED` mocks on `window`
- `browser.enabled: true` with a single chromium instance

You can add more browser instances in your config if you want cross-browser coverage:

```typescript
browser: {
  ...defaultConfig.browser,
  instances: [
    { browser: "chromium" },
    { browser: "firefox" },
    { browser: "webkit" },
  ],
  provider: playwright(),
},
```

#### 4. Add a test script

```json
{
  "scripts": {
    "test:client:unit": "vitest run --config vitest.client.unit.config.ts"
  }
}
```

### Quick Start

```typescript
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { createNode } from "@bonsae/nrg/test/client/unit";
import MyComponent from "../../../src/client/components/my-component.vue";

describe("MyComponent", () => {
  test("renders with node props", async () => {
    const { node } = createNode({ name: "my-node", timeout: 30 });
    const screen = render(MyComponent, {
      props: { node, propName: "timeout", value: 30 },
    });
    await expect.element(screen.getByText("Timeout")).toBeInTheDocument();
  });
});
```

### API

#### `defaultConfig`

Vitest test config with browser mode enabled (chromium), setup files, and timeout. Spread it into your `defineConfig` and add `provider: playwright()` in the `browser` override.

#### `createNode(overrides?)`

Creates a mock Node-RED node object for passing as a component prop. Returns `{ node, RED }` — a `TestNode` with sensible defaults (`id`, `type`, `changed`, `_def`, `_`) and the mock `RED` instance with all methods wrapped in `vi.spyOn`.

Because every RED method is spied, you can assert on calls directly without manual setup:

```typescript
const { node, RED } = createNode({ name: "test", retries: 3 });
render(MyComponent, { props: { node } });
expect(RED.editor.createEditor).toHaveBeenCalled();
```

You can override any method per test while keeping the default implementation for the rest:

```typescript
const { node, RED } = createNode();
RED.nodes.dirty.mockReturnValue(true);
```

`vi.restoreAllMocks()` safely strips the spies. The next `createNode` call re-applies fresh ones, so tests stay isolated.

The mock provides:

| Namespace     | Methods                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `RED._`       | `_(key)` — returns the key as-is                                             |
| `RED.editor`  | `createEditor(options)`, `prepareConfigNodeSelect(...)`, `validateNode(...)` |
| `RED.tray`    | `show(...)`, `close()`                                                       |
| `RED.popover` | `tooltip(...)`                                                               |
| `RED.nodes`   | `registerType(...)`, `node(...)`, `dirty(...)`                               |
| `RED.events`  | `on(...)`, `off(...)`, `emit(...)`                                           |
| `RED.settings`| `Record<string, any>` — empty object, reset each test via `beforeEach` in setup |
| `RED.notify`  | `notify(...)` — no-op                                                        |

### Examples

```typescript
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { createNode } from "@bonsae/nrg/test/client/unit";

describe("editor component", () => {
  test("asserts RED.editor.createEditor was called", async () => {
    const { node, RED } = createNode();
    render(MyEditorInput, { props: { node, value: "test content" } });
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });
  });

  test("renders node form", async () => {
    const { node } = createNode({ name: "test" });
    const screen = render(MyForm, {
      props: { node },
    });
    await expect.element(screen.getByText("test")).toBeInTheDocument();
  });

  test("validates required fields", async () => {
    const screen = render(MyInput, {
      props: { value: "", label: "Name", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("emits v-model updates", async () => {
    const onUpdate = vi.fn();
    const screen = render(MyInput, {
      props: { value: "", "onUpdate:modelValue": onUpdate },
    });
    const input = screen.container.querySelector("input") as HTMLInputElement;
    input.value = "new value";
    input.dispatchEvent(new Event("input"));
    expect(onUpdate).toHaveBeenCalledWith("new value");
  });
});
```

::: info Translations
Component tests use key-passthrough mocks — the setup file installs a `$i18n` mock and `RED._` that return the translation key as-is. This lets you verify the correct keys are used, but not that translations resolve to the right text. To test that translations are properly loaded and rendered, use [Browser E2E Testing](#browser-e2e-testing) where Node-RED loads the real locale files.
:::

## Browser E2E Testing

NRG provides a browser test library at `@bonsae/nrg/test/client/e2e` for end-to-end testing of your node's editor UI. It uses [Playwright](https://playwright.dev/) to drive a real Node-RED editor and interact with your form fields, typed inputs, config selectors, and validation messages.

::: tip When to use
Use browser E2E tests to verify that your node's editor form renders correctly, validates input, persists values, and displays correct translations. Server-side logic is better tested with `@bonsae/nrg/test/server/unit` (see above).
:::

### Setup

#### 1. Install dependencies

```bash
pnpm add -D playwright vitest
```

#### 2. Add a test tsconfig

```json
// tests/client/e2e/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/client/e2e.json",
  "include": ["**/*.ts"]
}
```

#### 3. Create a Vitest config for E2E browser tests

```typescript
// vitest.core.client.e2e.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: "tests/core/client/e2e/global-setup.ts",
    include: ["tests/core/client/e2e/**/*.test.ts"],
  },
});
```

#### 4. Create a global setup file

The global setup builds your node package, starts a Node-RED instance, deploys a test flow, and writes the port to a temp file so tests can connect to it.

```typescript
// tests/core/client/e2e/global-setup.ts
import fs from "fs";
import os from "os";
import path from "path";
import { build as buildServer } from "@bonsae/nrg/vite/server/build";
import { build as buildClient } from "@bonsae/nrg/vite/client/build";
import { NodeRedLauncher } from "@bonsae/nrg/vite/node-red-launcher";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/my-node");
const OUT_DIR = path.join(FIXTURE_DIR, "dist-e2e");
const NODE_RED_DIR = path.join(FIXTURE_DIR, ".node-red");
const INSTALLED_PKG_DIR = path.join(NODE_RED_DIR, "node_modules", "my-node");
export const PORT_FILE = path.join(os.tmpdir(), "nrg-client-e2e-port");

let launcher: NodeRedLauncher;

export async function setup(): Promise<void> {
  // Build your node package
  // ... build server and client ...

  // Install into Node-RED's node_modules
  fs.mkdirSync(INSTALLED_PKG_DIR, { recursive: true });
  fs.cpSync(OUT_DIR, INSTALLED_PKG_DIR, { recursive: true });

  // Start Node-RED
  launcher = new NodeRedLauncher(INSTALLED_PKG_DIR, {
    runtime: { port: 1881 },
  });
  const port = await launcher.start();

  // Deploy a test flow
  await fetch(`http://localhost:${port}/flows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Node-RED-Deployment-Type": "full",
    },
    body: JSON.stringify([
      { id: "tab1", type: "tab", label: "E2E Tests" },
      {
        id: "n1",
        type: "my-node",
        z: "tab1",
        name: "",
        x: 250,
        y: 200,
        wires: [[]],
      },
    ]),
  });

  // Write port for test files
  fs.writeFileSync(PORT_FILE, String(port));
}

export async function teardown(): Promise<void> {
  await launcher?.stop();
  launcher?.cleanup();
}
```

#### 5. Create a test file

```typescript
// tests/core/client/e2e/my-node.test.ts
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import { chromium, type Browser } from "playwright";
import { NodeRedEditor } from "@bonsae/nrg/test/client/e2e";
import { PORT_FILE } from "./global-setup";

describe("my-node editor", () => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    const port = Number(fs.readFileSync(PORT_FILE, "utf-8").trim());
    browser = await chromium.launch();
    const page = await browser.newPage();
    editor = new NodeRedEditor(page, port);
    await editor.open();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("name field accepts input", async () => {
    await editor.editNode("n1");
    const name = editor.field("Name");
    await name.fill("Test Node");
    await editor.clickDone();

    await editor.editNode("n1");
    expect(await name.getValue()).toBe("Test Node");
    await editor.clickCancel();
  });
});
```

#### 6. Run the tests

```bash
npx vitest run --config vitest.core.client.e2e.config.ts
```

### API

#### `NodeRedEditor`

Controls the Node-RED editor page. Wraps a Playwright `Page` instance.

```typescript
const editor = new NodeRedEditor(page, port, {
  screenshotDir: "test-results/screenshots", // optional
});
```

| Method                        | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| `editor.open()`               | Navigate to Node-RED and wait for the editor to load       |
| `editor.editNode(nodeId)`     | Open the edit dialog for a node                            |
| `editor.clickDone()`          | Click the Done button and wait for the tray to close       |
| `editor.clickCancel()`        | Click the Cancel button and wait for the tray to close     |
| `editor.field(label)`         | Get a `NodeRedField` for the form row with the given label |
| `editor.deployFlow(flow)`     | Deploy a flow via the REST API and reload the page         |
| `editor.screenshot(name)`     | Take a full-page screenshot, returns the file path         |
| `editor.expectNoPageErrors()` | Assert no uncaught JavaScript errors occurred              |
| `editor.tray`                 | Locator for the tray body wrapper                          |
| `editor.errors`               | Array of captured page error messages                      |

#### `NodeRedField`

Represents a single form row in the node edit dialog. All field types (text, number, boolean, typed input, config input, code editor, textarea) are accessed through the same class.

```typescript
const name = editor.field("Name");
```

**Input fields** (text, number, password):

| Method / Property      | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `field.input`          | Locator for the `<input>` element                                   |
| `field.fill(value)`    | Set the input value                                                 |
| `field.clear()`        | Clear the input value                                               |
| `field.getValue()`     | Get the current input value                                         |
| `field.getInputType()` | Get the input `type` attribute (`"text"`, `"number"`, `"password"`) |

**Boolean fields** (toggle, checkbox):

| Method / Property    | Description                       |
| -------------------- | --------------------------------- |
| `field.toggleSlider` | Locator for the NRG toggle slider |
| `field.toggle()`     | Click the toggle slider           |
| `field.checkbox`     | Locator for the checkbox input    |

**Typed input fields** (TypedInput, enum select, multi-select):

| Method / Property             | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `field.typedInputContainer`   | Locator for the typed input container                    |
| `field.getSelectedType()`     | Get the currently selected type (e.g. `"msg"`, `"str"`)  |
| `field.getSelectedValue()`    | Get the current typed input value                        |
| `field.getTypeMenuValues()`   | Open the type dropdown, return all type values, close it |
| `field.selectType(type)`      | Open the type dropdown and select a type                 |
| `field.getOptionMenuLabels()` | Open the option dropdown, return all labels, close it    |

**Config input fields** (NodeRef):

| Method / Property                | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `field.select`                   | Locator for the `<select>` element             |
| `field.editButton`               | Locator for the edit (pencil) button           |
| `field.addButton`                | Locator for the add (plus) button              |
| `field.getSelectedOption()`      | Get the selected option value                  |
| `field.getSelectedOptionLabel()` | Get the selected option display text           |
| `field.getOptions()`             | Get all option labels (excludes "Add new ...") |

**Code editor fields**:

| Method / Property     | Description                         |
| --------------------- | ----------------------------------- |
| `field.editorWrapper` | Locator for the code editor wrapper |
| `field.expandButton`  | Locator for the expand button       |

**Array text fields**:

| Method / Property | Description                          |
| ----------------- | ------------------------------------ |
| `field.textarea`  | Locator for the `<textarea>` element |

**Validation**:

| Method / Property                | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `field.requiredIndicator`        | Locator for the required asterisk (`*`)                          |
| `field.errorMessage`             | Locator for the validation error message                         |
| `field.expectError(containing?)` | Assert a validation error is visible, optionally containing text |
| `field.expectNoError()`          | Assert no validation error is visible                            |

**Visibility**:

| Method / Property        | Description                                |
| ------------------------ | ------------------------------------------ |
| `field.row`              | Locator for the entire `.form-row` element |
| `field.scrollIntoView()` | Scroll the field into the viewport         |
| `field.expectVisible()`  | Assert the field row is visible            |
| `field.expectHidden()`   | Assert the field row is hidden             |

### Examples

```typescript
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import { chromium, type Browser } from "playwright";
import { NodeRedEditor } from "@bonsae/nrg/test/client/e2e";
import { PORT_FILE } from "./global-setup";

describe("my-node editor", () => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    const port = Number(fs.readFileSync(PORT_FILE, "utf-8").trim());
    browser = await chromium.launch();
    const page = await browser.newPage();
    editor = new NodeRedEditor(page, port);
    await editor.open();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("text input round-trip", async () => {
    await editor.editNode("n1");
    const name = editor.field("Name");
    await name.fill("E2E Node");
    await editor.clickDone();

    await editor.editNode("n1");
    expect(await name.getValue()).toBe("E2E Node");
    await name.clear();
    await editor.clickDone();
  });

  test("number input renders correctly", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    expect(await count.getInputType()).toBe("number");
    await editor.clickCancel();
  });

  test("toggle renders for boolean field", async () => {
    await editor.editNode("n1");
    const enabled = editor.field("Enabled");
    expect(await enabled.toggleSlider.isVisible()).toBe(true);
    await editor.clickCancel();
  });

  test("typed input shows available types", async () => {
    await editor.editNode("n1");
    const target = editor.field("Target");
    const types = await target.getTypeMenuValues();
    expect(types).toContain("msg");
    expect(types).toContain("str");
    await editor.clickCancel();
  });

  test("enum field shows options", async () => {
    await editor.editNode("n1");
    const color = editor.field("Color");
    const labels = await color.getOptionMenuLabels();
    expect(labels).toEqual(["red", "green", "blue"]);
    await editor.clickCancel();
  });

  test("config input shows registered config nodes", async () => {
    await editor.editNode("n1");
    const server = editor.field("Server");
    expect(await server.select.isVisible()).toBe(true);
    expect(await server.editButton.isVisible()).toBe(true);
    const options = await server.getOptions();
    expect(options).toContain("Test Server");
    await editor.clickCancel();
  });

  test("validation error appears for invalid input", async () => {
    await editor.editNode("n1");
    const name = editor.field("Name");
    await name.expectError("must NOT have fewer than 1 characters");
    await editor.clickCancel();
  });

  test("validation error clears when corrected", async () => {
    await editor.editNode("n1");
    const name = editor.field("Name");
    await name.expectError();
    await name.fill("Valid");
    await name.expectNoError();
    await name.clear();
    await editor.clickCancel();
  });

  test("required indicator is visible", async () => {
    await editor.editNode("n1");
    const name = editor.field("Name");
    expect(await name.requiredIndicator.isVisible()).toBe(true);
    expect(await name.requiredIndicator.textContent()).toBe("*");
    await editor.clickCancel();
  });

  test("screenshots for visual review", async () => {
    await editor.editNode("n1");
    const name = editor.field("Name");
    await name.scrollIntoView();
    await editor.screenshot("name-field");
    await editor.clickCancel();
  });

  test("no page errors after interaction", async () => {
    await editor.editNode("n1");
    await editor.clickCancel();
    editor.expectNoPageErrors();
  });

  test("labels display translated text", async () => {
    await editor.editNode("n1");
    // Node-RED loads locales/<lang>/my-node.json at runtime.
    // E2E tests run against the real editor, so translations are resolved.
    const name = editor.field("Name");
    await name.expectVisible();
    // Verify the label shows the translated string, not the i18n key
    const timeout = editor.field("Timeout");
    await timeout.expectVisible();
    await editor.clickCancel();
  });
});
```

### Multi-browser testing

Run the same tests across Chromium, Firefox, and WebKit using `describe.each`:

```typescript
import { chromium, firefox, webkit, type BrowserType } from "playwright";

const BROWSERS: Array<{ name: string; type: BrowserType }> = [
  { name: "chromium", type: chromium },
  { name: "firefox", type: firefox },
  { name: "webkit", type: webkit },
];

describe.each(BROWSERS)("my-node editor ($name)", ({ type }) => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    browser = await type.launch();
    const page = await browser.newPage();
    editor = new NodeRedEditor(page, port);
    await editor.open();
  });

  afterAll(async () => {
    await browser.close();
  });

  // ... tests run once per browser engine
});
```
