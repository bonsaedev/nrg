# Client Component & E2E Testing

Render a node's editor form in a real browser (component tests), and drive the whole Node-RED editor end-to-end with Playwright.

## Client Component Testing

Component tests render your Vue editor components in a real browser with mocked Node-RED globals. They use [Vitest browser mode](https://vitest.dev/guide/browser/) so you can test form rendering, widget interactions, and RED API calls without running a full Node-RED instance.

::: warning Server/client boundary
Component tests run in a **real browser**, so never value-import a server-runtime module. That includes your `src/shared/schemas/*` files: they import `defineSchema`/`SchemaType` from `@bonsae/nrg/schema`, which loads TypeBox, and pulling that into the browser bundle crashes the test. Instead, pass your node's `type` to `createNode()` and let the [schemas globalSetup](#resolving-schemas-by-node-type) hand the real schema to the test as serialized data.
:::

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest
```

NRG ships `@vitejs/plugin-vue` as a direct dependency; `@vitest/browser-playwright`, `vitest-browser-vue`, and `playwright` are optional peer dependencies — install them as shown in [Dependencies](./testing#dependencies).

#### 2. Create a tsconfig

```json
// tests/client/component/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/client/component.json",
  "include": [
    "**/*.ts",
    "../../../src/client/**/*.ts",
    "../../../src/client/**/*.vue"
  ]
}
```

#### 3. Create a vitest config

```typescript
// vitest.client.component.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/client/component/config";

export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/client/component/**/*.test.ts"],
    },
  }),
);
```

The `nrg` config provides:

- Vue plugin (`@vitejs/plugin-vue`)
- Playwright browser provider with chromium, firefox, and webkit instances
- `testTimeout: 30_000`
- `setupFiles` pointing to the built-in setup that installs `$` and `RED` mocks on `window` and configures Vue i18n
- `@` alias pointing to `src/` in your project root
- `@bonsae/nrg/client` alias resolved to the test library (so `useFormNode` imports work without a runtime bundle)
- a default `include` of `tests/client/component/**/*.test.ts`
- a `globalSetup` of `@bonsae/nrg/test/client/component/schemas`, which runs in Node, serializes your package's node schemas (the default export of `src/server`), and provides each node's `configSchema`/`credentialsSchema` to the browser tests as data — so `createNode({ type })` validates against your real production schema (see [Resolving schemas by node type](#resolving-schemas-by-node-type))

The default config deliberately does **not** prebundle `@bonsae/nrg/server`: schemas reach the browser as serialized data via the globalSetup above, never by value-importing a schema (or node) module. Don't add `@bonsae/nrg/server` to your own `optimizeDeps`.

To test on a single browser only, replace the `browser.instances` array. Use a
spread, not `mergeConfig` — `mergeConfig` **concatenates** arrays, so it would
append `chromium` to nrg's defaults and still run every browser. Spreading
`nrg.test` lets the keys below replace nrg's defaults cleanly:

```typescript
export default defineConfig({
  test: {
    ...nrg.test,
    include: ["tests/client/component/**/*.test.ts"],
    browser: {
      ...nrg.test.browser,
      instances: [{ browser: "chromium" }],
    },
  },
});
```

#### 4. Add a test script

```json
{
  "scripts": {
    "test:client:component": "vitest run --config vitest.client.component.config.ts"
  }
}
```

### API

#### `createNode(options?)`

Creates a **reactive** mock Node-RED node and the `provide` object needed by `useFormNode()` components. Returns `{ node, errors, RED, provide }` — the node and errors are wrapped in Vue `reactive()`, so mutating them in a test re-renders mounted components and re-runs validation, exactly like the real editor.

| Option              | Description                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | The node's registered `type`. Resolves the real `configSchema`/`credentialsSchema` for that node from the serialized-schema map the [schemas globalSetup](#resolving-schemas-by-node-type) provides — validate against the production schema without importing it into the browser. |
| `configs`           | Initial config values, spread onto the node                                                                                                                                                                              |
| `credentials`       | Initial credential values, nested under `node.credentials`                                                                                                                                                               |
| `configSchema`      | Explicit config schema (plain JSON Schema **data**). Overrides the `type`-resolved config schema; use for inline/ad-hoc schemas.                                                                                          |
| `credentialsSchema` | Explicit credentials schema (plain JSON Schema **data**). Overrides the `type`-resolved credentials schema; errors are keyed `node.credentials.<prop>`.                                                                   |
| `nodes`             | Fake config nodes resolvable via `RED.nodes.node(id)` — required for NodeRef field validation                                                                                                                            |

A plain object without any of these keys is shorthand for `configs`:

```typescript
const { provide } = createNode({ name: "test", retries: 3 });
render(MyForm, { global: { provide } });
```

A plain object is treated as `configs` only when it has NONE of these keys: `type`, `configs`, `configSchema`, `credentialsSchema`, `nodes`. Note that `credentials` is **not** in that list — passing `{ credentials: {...} }` on its own is read as config values. To set credentials, include it alongside one of the recognized keys (for example `type` or `configSchema`).

When you pass a node `type`, `errors` is populated immediately against that node's **real** production schema — the same JSON the vite plugin injects into the editor — and kept in sync as the node changes. No schema import, no server runtime in the browser:

```typescript
const { node, errors } = createNode({
  type: "my-node",
  configs: { name: "" },
  credentials: { token: "" },
});
expect(errors["node.name"]).toBeDefined(); // invalid initial state

node.name = "valid";
await vi.waitFor(() => {
  expect(errors["node.name"]).toBeUndefined(); // revalidated reactively
});
```

`configSchema`/`credentialsSchema` can still be passed explicitly for inline or ad-hoc schemas — each overrides the corresponding `type`-resolved schema independently. They must be plain JSON Schema **data**; never value-import a schema module into a browser test (see the boundary note above).

Fields declared with `SchemaType.NodeRef` validate that the referenced config node exists — register fakes with `nodes`:

```typescript
const { errors } = createNode({
  type: "my-node",
  configs: { connection: "cfg-1" },
  nodes: [{ id: "cfg-1", type: "my-config" }],
});
expect(errors["node.connection"]).toBeUndefined();
```

When you also need the node or RED instance (e.g. to assert on `node.id` or spy on RED methods), destructure them:

```typescript
const { node, RED, provide } = createNode({ name: "test" });
render(MyForm, { global: { provide } });
expect(RED.editor.createEditor).toHaveBeenCalled();
```

You can override any RED method per test while keeping the default implementation for the rest:

```typescript
const { RED, provide } = createNode();
RED.nodes.dirty.mockReturnValue(true);
```

`vi.restoreAllMocks()` safely strips the spies. The next `createNode` call re-applies fresh ones, so tests stay isolated.

The mock implements the editor's `RED` contract with working state, reset between tests by the built-in setup:

| Namespace      | Behavior                                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RED._`        | `_(key)` — returns the key as-is                                                                                                                                                                                                        |
| `RED.editor`   | `createEditor(options)` returns a working mock editor — `getValue`/`setValue`, and `setValue` fires `getSession().on("change")` listeners like real ACE/Monaco. `prepareConfigNodeSelect(...)`, `validateNode(...)`                     |
| `RED.tray`     | `show(...)`, `close()`                                                                                                                                                                                                                  |
| `RED.popover`  | `create(options)` and `tooltip(...)` — both return chainable instances                                                                                                                                                                  |
| `RED.nodes`    | A working registry: `add`/`node`/`remove`/`clear`, `registerType`/`getType`, `eachNode`/`eachConfig`/`filterNodes`, `filterLinks`/`addLink`, `dirty()` getter/setter, `id()`. `createNode({ nodes })` fakes are visible to all of these |
| `RED.events`   | A functioning event bus — `emit` dispatches to `on` listeners, so tests can drive components subscribed to editor events                                                                                                                |
| `RED.comms`    | `subscribe`/`unsubscribe` plus a test-only `publish(topic, msg)` to simulate runtime messages — `+` and `#` topic wildcards supported                                                                                                   |
| `RED.settings` | `get`/`set`/`remove` plus direct property access (exportable settings appear as direct properties)                                                                                                                                      |
| `RED.notify`   | Returns a notification handle with `update()` and `close()`                                                                                                                                                                             |

Drive a component that listens to runtime state:

```typescript
const { RED, provide } = createNode({});
render(DeployStatus, { global: { provide } });

RED.comms.publish("nrg/deploy/job-1", { state: "done" });
await vi.waitFor(() => {
  // assert the component rendered the update
});
```

Editor instances created by components are reachable through the spy:

```typescript
const instance = vi.mocked(RED.editor.createEditor).mock.results[0].value;
instance.setValue("new code"); // fires the component's change listener
```

#### Resolving schemas by node type

`createNode({ type })` gets its schema from a **globalSetup** the default config wires up: `@bonsae/nrg/test/client/component/schemas`. It runs in Node (where importing the server is fine), imports your package's node registry — the default export of `src/server` — serializes every node's `configSchema`/`credentialsSchema` to plain JSON (exactly as the vite plugin does for production), and provides them to the browser tests as data. Your test names a `type`; the harness hands back the real schema. Nothing server-side is ever value-imported into the browser.

If your node registry is **not** the default export of `src/server`, write your own globalSetup with `provideSchemas`:

```typescript
// tests/client/component/schemas.ts
import { provideSchemas } from "@bonsae/nrg/test/client/component/schemas";
import registry from "../../../src/server"; // wherever your defineModule({ nodes }) lives

export default provideSchemas(registry);
```

then point the config at it instead of the convention default:

```typescript
test: {
  globalSetup: ["./tests/client/component/schemas.ts"],
}
```

`@bonsae/nrg/test/client/component/schemas` also exports `loadRegistry(cwd?)` and `serializeRegistry(registry)` for fully custom setups.

#### Driving state in tests

Both `node` and `errors` are plain reactive objects — there are no special setters. Mutate them directly and mounted components react, exactly like in the real editor:

```typescript
const { node, errors, provide } = createNode({ name: "ok" });
const component = render(MyForm, { global: { provide } });

node.name = "renamed"; // form re-renders, schema (if any) revalidates

errors["node.connection"] = "Connection is required"; // simulate an error
await vi.waitFor(() => {
  // assert how your component renders the error
});
delete errors["node.connection"]; // clear it
```

When a `configSchema` is provided, validation owns `errors` — manual entries are recomputed away on the next node mutation. Inject errors by hand only in schema-less setups.

### Examples

```typescript
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { createNode } from "@bonsae/nrg/test/client/component";
import MyForm from "../../../src/client/components/my-form.vue";

describe("my-form component", () => {
  test("renders fields from injected node", async () => {
    const { provide } = createNode({
      name: "test",
      url: "https://example.com",
    });
    const component = render(MyForm, {
      global: { provide },
    });
    await expect
      .element(component.getByDisplayValue("test"))
      .toBeInTheDocument();
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
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });
  });

  test("validates required fields", async () => {
    const component = render(MyInput, {
      props: { value: "", label: "Name", required: true },
    });
    await expect.element(component.getByText("*")).toBeInTheDocument();
  });

  test("emits v-model updates", async () => {
    const onUpdate = vi.fn();
    const component = render(MyInput, {
      props: { value: "", "onUpdate:modelValue": onUpdate },
    });
    const input = component.container.querySelector(
      "input",
    ) as HTMLInputElement;
    input.value = "new value";
    input.dispatchEvent(new Event("input"));
    expect(onUpdate).toHaveBeenCalledWith("new value");
  });

  test("reveals conditional fields when the node changes", async () => {
    const { node, provide } = createNode({ apexType: "invocable" });
    const component = render(MyForm, { global: { provide } });
    expect(component.container.textContent).not.toContain("URL Mapping");

    node.apexType = "rest"; // reactive — the form re-renders

    await vi.waitFor(() => {
      expect(component.container.textContent).toContain("URL Mapping");
    });
  });

  test("clears the validation error once the node is valid", async () => {
    const { node, errors, provide } = createNode({
      type: "my-node",
      configs: { name: "" },
    });
    render(MyForm, { global: { provide } });
    expect(errors["node.name"]).toBeDefined();

    node.name = "My Node";

    await vi.waitFor(() => {
      expect(errors["node.name"]).toBeUndefined();
    });
  });
});
```

::: info Translations
Component tests use key-passthrough mocks — the setup file installs a `$i18n` mock and `RED._` that return the translation key as-is. This lets you verify the correct keys are used, but not that translations resolve to the right text. To test that translations are properly loaded and rendered, use [Browser E2E Testing](#client-e2e-testing) where Node-RED loads the real locale files.
:::

## Client E2E Testing

E2E tests start a real Node-RED instance with your nodes installed and drive the editor with [Playwright](https://playwright.dev/). They test the full stack — schema-driven form generation, validation messages, TypedInput widgets, config node selectors, and locale resolution.

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest
```

`playwright` is an optional peer dependency — install it as shown in [Dependencies](./testing#dependencies).

#### 2. Create a tsconfig

```json
// tests/client/e2e/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/client/e2e.json",
  "include": ["**/*.ts"]
}
```

#### 3. Create a vitest config

```typescript
// vitest.client.e2e.config.ts
import { defineConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/client/e2e/config";

// Spread `nrg.test` (not `mergeConfig`): the e2e tests replace the default
// `globalSetup` with their own, and `mergeConfig` CONCATENATES arrays — it would
// run both nrg's default global setup and yours (two Node-RED boots). A spread
// lets the keys below replace nrg's defaults cleanly.
export default defineConfig({
  test: {
    ...nrg.test,
    globalSetup: "tests/client/e2e/global-setup.ts",
    include: ["tests/client/e2e/**/*.test.ts"],
  },
});
```

The `nrg` config provides:

- `testTimeout: 60_000`
- `hookTimeout: 120_000`
- a default `include` of `tests/client/e2e/**/*.test.ts`

#### 4. Create a global setup file

```typescript
// tests/client/e2e/global-setup.ts
import {
  setup as baseSetup,
  teardown as baseTeardown,
} from "@bonsae/nrg/test/client/e2e";

export async function setup() {
  await baseSetup({
    flow: [
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
    ],
  });
}

export async function teardown() {
  await baseTeardown();
}
```

If your project uses a `node-red.settings.ts` file that is not at the project root, pass `settingsFile` with the path to it:

```typescript
await baseSetup({
  settingsFile: "config/node-red.settings.ts",
  flow: [
    /* ... */
  ],
});
```

#### 5. Create a test file

```typescript
// tests/client/e2e/my-node.test.ts
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { NodeRedEditor } from "@bonsae/nrg/test/client/e2e";

describe("my-node editor", () => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    const port = Number(process.env.NODE_RED_PORT);
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

#### 6. Add a test script

```json
{
  "scripts": {
    "test:client:e2e": "vitest run --config vitest.client.e2e.config.ts"
  }
}
```

### API

#### `NodeRedEditor`

Controls the Node-RED editor page. Wraps a Playwright `Page` instance.

```typescript
const editor = new NodeRedEditor(page, port, {
  screenshotDir: "test-results/screenshots", // optional
});
```

| Method                            | Description                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `editor.open()`                   | Navigate to Node-RED and wait for the editor to load                                          |
| `editor.editNode(nodeId)`         | Open the edit dialog for a node                                                               |
| `editor.clickDone()`              | Click the Done button and wait for the tray to close                                          |
| `editor.clickCancel()`            | Click the Cancel button and wait for the tray to close                                        |
| `editor.clickConfigDone()`        | Close the config-node tray stacked above the node tray                                        |
| `editor.clickConfigCancel()`      | Cancel the config-node tray                                                                   |
| `editor.field(label)`             | Get a `NodeRedField` for the form row with the given label (scoped to the topmost tray)       |
| `editor.getNode(nodeId)`          | JSON-safe snapshot of a node in the editor model — assert persistence after `clickDone()`     |
| `editor.clickDeploy()`            | Click Deploy (confirming the dialog if needed) and wait for a clean workspace                 |
| `editor.getDeployedFlow()`        | Fetch the deployed flow from the runtime (`GET /flows`)                                       |
| `editor.getNodePortCount(nodeId)` | Count the output ports rendered for a node on the canvas                                      |
| `editor.toggleLifecyclePort(ariaLabel)` | Click an Error/Complete/Status lifecycle output-port toggle by its accessible name      |
| `editor.getNodeLabel(nodeId)`     | The node's label text on the canvas                                                           |
| `editor.getNodeStatus(nodeId)`    | The status text under the node (`""` when none)                                               |
| `editor.deployFlow(flow)`         | Deploy a flow via the REST API and reload the page                                            |
| `editor.screenshot(name)`         | Take a full-page screenshot, returns the file path                                            |
| `editor.closeAllTrays()`          | Best-effort close of every open tray — keeps a failed test from leaking state                 |
| `editor.expectNoPageErrors()`     | Assert no uncaught JavaScript errors occurred, then clear the list — call it from `afterEach` |
| `editor.tray`                     | Locator for the tray body wrapper                                                             |
| `editor.errors`                   | Array of captured page error messages                                                         |

Isolate tests from each other and fail any test that triggers an uncaught editor error:

```typescript
afterEach(async () => {
  await editor.closeAllTrays();
  editor.expectNoPageErrors();
});
```

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

| Method / Property                | Description                                           |
| -------------------------------- | ----------------------------------------------------- |
| `field.select`                   | Locator for the `<select>` element                    |
| `field.editButton`               | Locator for the edit (pencil) button                  |
| `field.addButton`                | Locator for the add (plus) button                     |
| `field.openAddConfig()`          | Click + and wait for the config tray to open          |
| `field.openEditConfig()`         | Click the pencil and wait for the config tray to open |
| `field.getSelectedOption()`      | Get the selected option value                         |
| `field.getSelectedOptionLabel()` | Get the selected option display text                  |
| `field.getOptions()`             | Get all option labels (excludes "Add new ...")        |

Once the config tray is open, `editor.field(label)` resolves fields inside it (fields are scoped to the topmost tray). Close it with `editor.clickConfigDone()` — the node tray underneath stays open:

```typescript
await editor.editNode("n1");
const server = editor.field("Server");
await server.openAddConfig();
await editor.field("Host").fill("example.com"); // config tray field
await editor.clickConfigDone();
expect(await server.getSelectedOptionLabel()).toBe("example.com");
await editor.clickDone();
```

**Code editor fields**:

| Method / Property             | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| `field.editorWrapper`         | Locator for the code editor wrapper                   |
| `field.getEditorValue()`      | Read the code editor's content (Monaco, ACE fallback) |
| `field.setEditorValue(value)` | Replace the code editor's content                     |
| `field.expandButton`          | Locator for the expand button                         |

**Autocomplete** (TypedInput types with an `autoComplete` source):

| Method / Property                          | Description                                                |
| ------------------------------------------ | ---------------------------------------------------------- |
| `field.getAutoCompleteSuggestions(prefix)` | Type `prefix` and return the suggestion labels that appear |

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
import { chromium, type Browser } from "playwright";
import { NodeRedEditor } from "@bonsae/nrg/test/client/e2e";

describe("my-node editor", () => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    const port = Number(process.env.NODE_RED_PORT);
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
    const port = Number(process.env.NODE_RED_PORT);
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

### Testing locales

Node-RED resolves the editor language from the browser. Force a locale through the Playwright context to assert translated labels:

```typescript
const page = await browser.newPage({ locale: "pt-BR" });
const editor = new NodeRedEditor(page, port);
await editor.open();

await editor.editNode("n1");
await editor.field("Nome").expectVisible(); // pt-BR label from your locale files
```
