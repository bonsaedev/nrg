# Testing

NRG nodes have two runtime surfaces — server-side logic (Node.js) and client-side UI (browser) — each with its own test strategies. NRG ships test libraries for all of them so you can verify your nodes end-to-end without running a manual Node-RED session.

::: tip Scaffolded projects
If you created your project with `@bonsae/create-nrg`, the vitest configs, setup files, tsconfigs, dependencies, and folder structure described below are already in place. You can skip the setup sections and go straight to the API and examples.
:::

## Dependencies

NRG ships the test libraries themselves and bundles the Vue plugin integration (`@vitejs/plugin-vue`) it needs for component tests. The test runner and the DOM/browser tooling are peer dependencies you install for the test types you use:

| Package                      | Required for               | Why it's a peer dep                                                                           |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `vitest`                     | All tests                  | Test runner — your project controls the version and runs it via CLI                           |
| `happy-dom`                  | Client unit tests          | DOM environment for client unit tests (`environment: "happy-dom"`) — your project provides it |
| `@vitest/browser-playwright` | Component tests            | Playwright browser provider for Vitest — imported in vitest config files                      |
| `playwright`                 | Component tests, E2E tests | Test files import it directly (e.g., `import { chromium } from "playwright"`)                 |
| `vitest-browser-vue`         | Component tests            | Provides the `render` helper for mounting Vue components in browser tests                     |
| `@vitest/coverage-v8`        | Coverage (Node.js tests)   | Optional — only needed when running with `--coverage`                                         |
| `@vitest/coverage-istanbul`  | Coverage (browser tests)   | Optional — only needed when running with `--coverage`                                         |

```bash
# required
pnpm add -D vitest

# for client unit tests (DOM environment)
pnpm add -D happy-dom

# for server integration tests (a real in-process Node-RED runtime)
pnpm add -D node-red

# for component tests
pnpm add -D @vitest/browser-playwright playwright vitest-browser-vue

# optional: coverage providers
pnpm add -D @vitest/coverage-istanbul  # for browser-based tests (component, e2e)
pnpm add -D @vitest/coverage-v8        # for Node.js tests (server unit, server integration, client unit)
```

## Test Types

### Server

| Type            | What it tests                                                                                                                 | Speed                              | Library                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| **Unit**        | Node lifecycle, input/output routing, config, credentials, context stores, error handling                                     | Fast (Node.js, no browser)         | `@bonsae/nrg/test/server/unit`        |
| **Integration** | Deployed nodes in a real Node-RED runtime — flow wiring, NodeRef resolution, credentials, context, multi-node message passing | Medium (boots Node-RED in-process) | `@bonsae/nrg/test/server/integration` |

Server **unit** tests instantiate your node class with mocked Node-RED internals and exercise it in-process. `createNode` wires up the full lifecycle (`registered()`, `created()`, input handlers, close) so you test real behavior, not stubs.

Both server test tiers give your node the same ports it has in production. If your node declares its ports only through the `IONode` generics (no `inputSchema`/`outputsSchema`), the harness reads those types and wires the ports up for you: the normal outputs, any named `Port<T>` outputs, and the built-in `error`/`complete`/`status` ports. No extra setup is needed.

Server **integration** tests boot a real, headless Node-RED runtime, register your node classes through the same path production uses, deploy a flow, and drive it with real messages. Use them to verify the things mocks can't: that a config node resolves through a real `NodeRef`, that credentials reach a deployed node, that wired nodes pass messages, and that context stores persist across a flow.

### Client

| Type          | What it tests                                                                               | Speed                         | Library                             |
| ------------- | ------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| **Unit**      | Pure TypeScript logic used by client code (validation, utilities, helpers)                  | Fast (happy-dom)              | `@bonsae/nrg/test/client/unit`      |
| **Component** | Vue editor components — rendering, reactivity, user interactions, validation, RED API calls | Medium (headless browsers)    | `@bonsae/nrg/test/client/component` |
| **E2E**       | Full editor round-trip — form rendering, validation, TypedInput, config selectors, i18n     | Slow (real Node-RED instance) | `@bonsae/nrg/test/client/e2e`       |

Client **unit** tests cover standalone TypeScript modules (validation logic, format helpers, etc.) without rendering Vue components. They run in a happy-dom environment with mocked `RED` and `$` globals.

Client **component** tests render individual Vue components with Vitest browser mode and mocked Node-RED globals. The node and errors returned by `createNode()` are reactive — mutate them directly to drive conditional rendering, schema-driven validation, and RED API calls. Monaco editors and jQuery widget visuals stay mocked — that's what E2E is for.

Client **E2E** tests start a real Node-RED instance with your nodes installed and drive the editor with Playwright. They test the full stack — schema-driven form generation, validation messages, TypedInput widgets, config node selectors, and locale resolution.

### When to Use What

| I want to verify...                                                | Use                |
| ------------------------------------------------------------------ | ------------------ |
| Input handler transforms a message correctly                       | Server unit        |
| Node sets status after processing                                  | Server unit        |
| Config node credentials are resolved                               | Server unit        |
| TypedInput resolves msg/flow/global values                         | Server unit        |
| Wired nodes pass a message end to end through a flow               | Server integration |
| A real config node resolves and is used by a deployed node         | Server integration |
| Credentials reach a node deployed in a real runtime                | Server integration |
| A node reads or writes real flow/global context                    | Server integration |
| A validation utility rejects invalid input                         | Client unit        |
| A helper function formats data correctly                           | Client unit        |
| My Vue form renders the right fields                               | Client component   |
| A component emits `update:modelValue` on input                     | Client component   |
| Changing one field reveals or hides another                        | Client component   |
| Fixing an invalid value clears its validation error                | Client component   |
| A NodeRef field rejects ids of unregistered config nodes           | Client component   |
| `RED.editor.createEditor` is called on mount                       | Client component   |
| The editor form shows a validation error for empty required fields | Client E2E         |
| A TypedInput dropdown offers the correct types                     | Client E2E         |
| Config node selector shows registered config nodes                 | Client E2E         |
| Creating a config node from the node editor works end to end       | Client E2E         |
| Toggling a built-in port changes the node's ports on the canvas    | Client E2E         |
| Translations display correctly in the editor                       | Client E2E         |

`NodeDefinition` lifecycle hooks (`label()`, `paletteLabel()`, `outputLabels()`, `button.onClick`, `onEditResize`) need no special tooling — they are plain functions. Call them in a client unit test with a fake `this`:

```typescript
import { defineNode } from "@bonsae/nrg/client";

const def = defineNode({
  /* ... */
});
expect(def.label!.call({ name: "My Node" } as any)).toBe("My Node");
```

## Server Unit Testing

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest
```

No additional dependencies needed — NRG provides the test utilities and mocks.

#### 2. Create a tsconfig

```json
// tests/server/unit/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/server/unit.json",
  "include": ["**/*.ts", "../../../src/server/**/*.ts"]
}
```

#### 3. Create a vitest config

```typescript
// vitest.server.unit.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/server/unit/config";

export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/server/unit/**/*.test.ts"],
    },
  }),
);
```

The `nrg` config provides:

- `testTimeout: 30_000`
- `@` alias pointing to `src/` in your project root
- a default `include` of `tests/server/unit/**/*.test.ts` — passing it explicitly above keeps the config self-documenting and scoped to the unit folder, separate from the integration tier in `tests/server/integration`

#### 4. Add a test script

```json
{
  "scripts": {
    "test:server": "vitest run --config vitest.server.unit.config.ts"
  }
}
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

**Returns:** `Promise<{ node, RED, error }>`. `error` holds whatever `created()` threw, or `undefined` if it succeeded. `createNode` never rejects when `created()` fails: production builds the node anyway and surfaces the failure on the first input, so you still get the node back and assert the setup failure via `error`.

#### `createRED(options?)`

Creates a standalone mock RED runtime. Useful for testing utilities or modules that depend on the RED object without instantiating a full node.

**Options:**

| Option     | Description              |
| ---------- | ------------------------ |
| `settings` | `RED.settings` overrides |

**Returns:** `MockRED`

#### Node Test Helpers

Every node returned by `createNode` has these helpers:

| Method                 | Description                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node.receive(msg)`    | Send a message through the node's `input()` handler (extra Node-RED message props beyond the input schema are allowed) |
| `node.close(removed?)` | Trigger the `closed()` lifecycle hook                                                                                                                                                           |
| `node.reset()`         | Clear all captured sent messages, statuses, and logs                                                                                                                                            |
| `node.sent()`          | Every emission is an array with one slot per output port, so `sent()[i][0]` is port 0 of emission `i`. To read a single port directly, use `sent(port)` (by index) or `sent(name)` (by port name). |
| `node.sent(port)`      | The per-port message for a specific output port (numeric index) — one level out of the positional array, still wrapped under the return key (`output`)                                          |
| `node.sent(name)`      | The per-port message for a named output port — resolved from the node's typed `Port<T>` names — still wrapped under the return key (`output`). Built-in `"error"`/`"complete"`/`"status"` ports resolve by name too. |
| `node.statuses()`      | All `status()` calls                                                                                                                                                                            |
| `node.logged(level?)`  | Log messages, optionally filtered by level (`"info"`, `"warn"`, `"error"`)                                                                                                                       |
| `node.warned()`        | Warning messages                                                                                                                                                                                |
| `node.errored()`       | Error messages                                                                                                                                                                                  |
| `node.context`         | Promise-based access to the node's `node` / `flow` / `global` context stores (`get`/`set`/`keys`, plus atomic `increment`/`update`) — preset values before `receive`, assert them after         |

### Examples

```typescript
import { describe, it, expect } from "vitest";
import { createNode } from "@bonsae/nrg/test/server/unit";
import { IONode, type Port } from "@bonsae/nrg/server";
import MyNode from "../../../src/server/nodes/my-node";
import Splitter from "../../../src/server/nodes/splitter";
import Router from "../../../src/server/nodes/router";
import RemoteServer from "../../../src/server/nodes/remote-server";

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

    // send() wraps the result under the return key (`output`) and stamps the
    // producing node (id/type/name/port) under `source`; the default `carry`
    // context mode keeps the incoming msg under `input`, not at the root.
    expect(node.sent(0)).toEqual([
      {
        output: { uppercased: "HELLO" },
        source: {
          id: expect.any(String),
          type: expect.any(String),
          name: expect.any(String),
          port: 0,
        },
        input: { payload: "hello" },
      },
    ]);
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

  it("returns a created() failure as `error`", async () => {
    const { node, error } = await createNode(MyNode, {
      config: { threshold: "not-a-number" },
    });
    // createNode still resolves — the node is constructed and the failure is
    // on `error`. The framework also sets a red "created() failed" status.
    expect(error).toBeInstanceOf(Error);
    expect(node.statuses()).toContainEqual(
      expect.objectContaining({ fill: "red" }),
    );
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
    expect(node.sent(0)).toMatchObject([
      { output: { result: "authenticated" }, input: { payload: "test" } },
    ]);
  });
});

describe("settings", () => {
  it("should resolve settings from RED.settings", async () => {
    const { node } = await createNode(MyNode, {
      settings: { myNodeTimeout: 3000 },
    });

    await node.receive({});
    // receive({}) carries no fields, so there's no `input` frame — just
    // `output` and `source`.
    expect(node.sent(0)).toMatchObject([{ output: { timeout: 3000 } }]);
  });
});

describe("TypedInput", () => {
  // Given a node that resolves a TypedInput in its input handler:
  //
  //   async input(msg) {
  //     const value = await this.config.target.resolve(msg);
  //     this.send({ value });
  //   }

  it("should resolve msg property via TypedInput", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "payload", type: "msg" } },
    });

    await node.receive({ payload: "from-msg" });
    expect(node.sent(0)).toMatchObject([
      { output: { value: "from-msg" }, input: { payload: "from-msg" } },
    ]);
  });

  it("should resolve string literal via TypedInput", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "hello", type: "str" } },
    });

    await node.receive({});
    expect(node.sent(0)).toMatchObject([{ output: { value: "hello" } }]);
  });

  it("should resolve number via TypedInput", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "42", type: "num" } },
    });

    await node.receive({});
    expect(node.sent(0)).toMatchObject([{ output: { value: 42 } }]);
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

    expect(node.sent(0)).toMatchObject([
      { output: { value: 75, label: "above" }, input: { payload: 75 } },
    ]);
    expect(node.sent(1)).toMatchObject([
      { output: { value: 30, label: "below" }, input: { payload: 30 } },
    ]);
  });
});

describe("named output ports", () => {
  it("routes to ports by name", async () => {
    // A types-only node whose two named ports come from the `Port<T>` generics —
    // no `outputsSchema`. The harness stamps the same topology the build injects,
    // so `sent(name)` resolves by name (like `sendToPort` in the node).
    //   import { IONode, type Port } from "@bonsae/nrg/server";
    type Output = {
      ok: Port<{ value: number }>;
      err: Port<{ reason: string }>;
    };
    class Router extends IONode<Config, never, { payload: number }, Output> {
      static override readonly type = "router";
      override async input(msg: { payload: number }) {
        if (msg.payload > 0) this.sendToPort("ok", { value: msg.payload });
        else this.sendToPort("err", { reason: "non-positive" });
      }
    }

    const { node } = await createNode(Router);

    await node.receive({ payload: 5 });
    expect(node.sent("ok")[0].output).toEqual({ value: 5 });
    expect(node.sent("err")).toHaveLength(0);
  });
});

describe("context store", () => {
  it("should persist values across triggers", async () => {
    const { node } = await createNode(MyNode);

    await node.receive({});
    await node.receive({});

    expect(node.sent(0)).toMatchObject([
      { output: { count: 1 } },
      { output: { count: 2 } },
    ]);
  });

  it("can preset and assert context directly", async () => {
    const { node } = await createNode(MyNode);

    // seed the flow store before driving the node...
    await node.context.flow!.set("count", 10);

    await node.receive({});

    // ...then assert what the node read/wrote
    expect(node.sent(0)).toMatchObject([{ output: { count: 11 } }]);
    expect(await node.context.flow!.get("count")).toBe(11);
  });
});

class ErrorNode extends IONode<any, any, { payload: string }> {
  static override readonly type = "error-test";
  override async input() {
    throw new Error("something broke");
  }
}

describe("error handling", () => {
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
    expect(node.sent(0)).toMatchObject([{ output: { greeting: "my-node.greeting" } }]);
  });
});

describe("named output ports (sendToPort)", () => {
  // Given a node whose two named ports come from a `Port<T>` Output generic:
  //
  //   type Output = {
  //     success: Port<{ result: string }>;
  //     failure: Port<{ error: string }>;
  //   };
  //   class Router extends IONode<Config, any, Input, Output> { ... }

  it("should route messages to named ports", async () => {
    const { node } = await createNode(Router, {
      config: { threshold: 50 },
    });

    await node.receive({ payload: 75 });
    expect(node.sent("success")).toMatchObject([
      { output: { result: "passed" }, input: { payload: 75 } },
    ]);
    expect(node.sent("failure")).toHaveLength(0);
  });

  it("should send to failure port on error condition", async () => {
    const { node } = await createNode(Router, {
      config: { threshold: 50 },
    });

    await node.receive({ payload: 10 });
    expect(node.sent("failure")).toMatchObject([
      { output: { error: "below threshold" }, input: { payload: 10 } },
    ]);
  });
});

describe("built-in emit ports", () => {
  // The built-in error, complete, and status ports are available on EVERY
  // IONode — the framework injects the `errorPort`/`completePort`/`statusPort`
  // config flags into every node, so a node does NOT declare anything to get
  // them. A test just turns one on by passing the flag to `createNode`, e.g.
  // `config: { errorPort: true }`. With the flag off (or omitted) the port isn't
  // there, so `node.sent("error")` returns `[]`. Declaring one of these in a
  // node's own configSchema is unnecessary — it only overrides the framework
  // default (off). See /guide/creating-a-node#lifecycle-output-ports.

  it("should emit to error port when enabled and input throws", async () => {
    // ErrorNode declares no port config — the `errorPort` flag alone enables it.
    const { node } = await createNode(ErrorNode, {
      config: { errorPort: true },
    });

    // The error port is the sole handler, so the throw is handled and
    // `receive()` resolves — it does NOT reject (contrast the no-errorPort case).
    await node.receive({ payload: "bad" });
    expect(node.sent("error")).toHaveLength(1);
    expect(node.sent("error")[0]).toMatchObject({
      error: { message: "something broke" },
    });
  });

  it("should not emit to a disabled built-in port", async () => {
    // Same node, error port left off: the port simply isn't there.
    const { node } = await createNode(ErrorNode, {
      config: { errorPort: false },
    });

    await expect(node.receive({ payload: "bad" })).rejects.toThrow();
    expect(node.sent("error")).toEqual([]);
  });

  it("should carry a thrown custom error's fields under error", async () => {
    // A node that throws a custom Error subclass:
    class RateLimitError extends Error {
      retryAfterMs: number;
      constructor(retryAfterMs: number) {
        super("rate limited");
        this.name = "RateLimitError";
        this.retryAfterMs = retryAfterMs;
      }
    }
    class RateLimitedNode extends IONode<any, any, { payload: string }> {
      static override readonly type = "rate-limited";
      override async input() {
        throw new RateLimitError(2000);
      }
    }

    const { node } = await createNode(RateLimitedNode, {
      config: { errorPort: true },
    });

    // errorPort enabled, so the throw is handled and receive() resolves.
    await node.receive({ payload: "go" });
    expect(node.sent("error")[0]).toMatchObject({
      error: { name: "RateLimitError", message: "rate limited", retryAfterMs: 2000 },
    });
  });

  it("should emit to complete port when enabled on successful processing", async () => {
    const { node } = await createNode(MyNode, {
      config: { completePort: true },
    });

    await node.receive({ payload: "hello" });
    expect(node.sent("complete")).toHaveLength(1);
  });

  it("should ride the value returned by input() on the complete port", async () => {
    // A node whose input() returns a value:
    class ReturningNode extends IONode<any, any, { payload: string }> {
      static override readonly type = "returning";
      override async input(msg: { payload: string }) {
        return { id: msg.payload, ok: true };
      }
    }

    const { node } = await createNode(ReturningNode, {
      config: { completePort: true },
    });

    await node.receive({ payload: "abc" });
    expect(node.sent("complete")).toHaveLength(1);
    // input()'s return value rides under `complete`, not `output`. (A void
    // return omits the `complete` key — arrival on the wire is the signal.)
    expect(node.sent("complete")[0]).toMatchObject({
      complete: { id: "abc", ok: true },
    });
  });

  it("should emit to status port when enabled and status is set", async () => {
    const { node } = await createNode(MyNode, {
      config: { statusPort: true },
    });

    await node.receive({ payload: "hello" });
    expect(node.sent("status")).toHaveLength(1);
    expect(node.sent("status")[0]).toMatchObject({
      status: { fill: "green", text: "ok" },
    });
  });
});
```

## Server Integration Testing

Integration tests boot a **real, headless Node-RED runtime** in-process, register your node classes through the same path production uses, deploy a flow, and drive it with real messages. Where unit tests mock Node-RED, integration tests run it — so they verify the seams mocks paper over: config-node `NodeRef` resolution, credentials reaching a deployed node, messages crossing wires, and context stores persisting across a flow.

Node-RED uses process-wide singletons, so each test **file** boots its own runtime in its own forked process and files run one at a time. Start one runtime per file in `beforeAll` and stop it in `afterAll`; deploy a fresh flow per test.

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest node-red
```

Integration tests embed whatever `node-red` your project has installed — the library never bundles it. Add `node-red` as a dev dependency (the same version range your nodes target).

#### 2. Create a tsconfig

```json
// tests/server/integration/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/server/integration.json",
  "include": ["**/*.ts", "../../../src/server/**/*.ts"]
}
```

#### 3. Create a vitest config

```typescript
// vitest.server.integration.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/server/integration/config";

export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/server/integration/**/*.test.ts"],
    },
  }),
);
```

The `nrg` config provides:

- a default `include` of `tests/server/integration/**/*.test.ts` — its own folder, separate from the unit tier's `tests/server/unit`
- `testTimeout: 30_000` and `hookTimeout: 30_000` (booting a runtime takes longer than a unit test)
- `pool: "forks"` with `fileParallelism: false` — each file gets an isolated process and they run serially, since Node-RED is a process-wide singleton
- `@` alias pointing to `src/` in your project root

Unit and integration tests are separated by folder — `tests/server/unit` and `tests/server/integration` — so each config picks up only its own tier and a missing `node-red` (or the slower runtime boot) never blocks fast unit feedback.

#### 4. Add a test script

```json
{
  "scripts": {
    "test:server:integration": "vitest run --config vitest.server.integration.config.ts"
  }
}
```

::: warning Published vs. linked NRG
The integration library ships with `@bonsae/nrg`. If your CI installs the published package, this works out of the box. The tests register your nodes against the **same** NRG copy your nodes import (`@bonsae/nrg/server`), so the runtime's `instanceof` checks pass — there is no second copy to clash with.
:::

### API

#### `startRuntime(options)`

Boots a headless Node-RED runtime with the given node types registered. Returns a `Runtime`.

| Option     | Description                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `nodes`    | Node classes (IONode / ConfigNode subclasses) to register — config nodes included                              |
| `settings` | Extra Node-RED settings merged over the headless defaults (e.g. raise `logging.console.level` to debug a test) |

**Returns:** `Promise<Runtime>`

#### `Runtime`

| Method           | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `runtime.flow()` | Start a fresh `Flow` to build, deploy, drive, and inspect     |
| `runtime.stop()` | Stop Node-RED, close the server, and remove the temp user dir |

#### `Flow`

| Method                              | Description                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `flow.addNode(Cls, config?, opts?)` | Add any node — regular or config. Returns a `NodeRef`. `opts`: `{ id?, name?, credentials? }` |
| `flow.deploy()`                     | Build the flow JSON and deploy it; resolves once the flow has started                         |
| `flow.clear()`                      | Drop the built nodes and clear captured messages (reset between tests)                        |

Pass a config node's `NodeRef` directly as a config value on another node — it serializes to the referenced id and resolves to the live instance, exactly like a real `NodeRef` field.

#### `NodeRef`

A handle to one node in the flow. Harness methods never collide with your node's own methods — the live instance lives inside the runtime.

| Method / Property         | Description                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref.wire(target, port?)` | Wire this node's output `port` (default `0`) to `target`'s input                                                                                                                        |
| `ref.receive(msg)`        | Deliver a message to this node's input                                                                                                                                                  |
| `ref.read(port?, opts?)`  | Consume the next un-read emission (FIFO cursor), awaiting it if not yet sent. `opts.timeout` defaults to `5000`ms                                                                       |
| `ref.sent(port?)`         | Snapshot of everything this node has emitted (optionally one port)                                                                                                                      |
| `ref.received(port?)`     | Snapshot of everything delivered to this node's input                                                                                                                                   |
| `ref.context`             | Promise-based access to the node's `node` / `flow` / `global` context stores (`get`/`set`/`keys`, plus atomic `increment`/`update`) — preset values before `receive`, assert them after |
| `ref.id` / `ref.type`     | The generated node id and its type                                                                                                                                                      |

`read()` walks emissions one at a time and waits for the next one — ideal for asserting ordered output or a single async result. `sent()` is a synchronous snapshot of everything emitted so far — ideal for counting.

::: tip Reading output
Each emission is `{ output: result, source: producingNode, input: incomingMsg }` — the node's result lives under `output`, the producing node (id/type/name/port) under `source`, and the incoming message under `input`, never spread at the top level. So assertions read `(await node.read()).output`.

How deep the `input` chain goes depends on the [context mode](./schemas#context-modes): the default `carry` keeps only the immediate previous message (flat and loop-safe), `trace` preserves the full lineage as `input.input.input…`, and a send with no incoming message records no `input` frame.
:::

### Examples

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startRuntime,
  type Runtime,
} from "@bonsae/nrg/test/server/integration";
import { IONode, ConfigNode } from "@bonsae/nrg/server";
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

class Doubler extends IONode<any, any, { value: number }, { doubled: number }> {
  static override readonly type = "doubler";
  override async input(msg: { value: number }) {
    this.send({ doubled: msg.value * 2 });
  }
}

describe("doubler (integration)", () => {
  let runtime: Runtime;

  beforeAll(async () => {
    runtime = await startRuntime({ nodes: [Doubler] });
  });

  afterAll(async () => {
    await runtime.stop();
  });

  it("processes input in a real runtime", async () => {
    const flow = runtime.flow();
    const node = flow.addNode(Doubler, {});
    await flow.deploy();

    await node.receive({ value: 21 });

    const out = (await node.read()) as { output: { doubled: number } };
    expect(out.output.doubled).toBe(42);
    expect(node.sent()).toHaveLength(1);
  });
});
```

**Resolving a config node through a real `NodeRef`** — `addNode` the config node, then pass its `NodeRef` as a config value:

```typescript
class Greeting extends ConfigNode {
  static override readonly type = "greeting-config";
  static override readonly configSchema = defineSchema(
    { greeting: SchemaType.String({ default: "hi" }) },
    { $id: "greeting-config:config" },
  );
  get greeting(): string {
    return (this.config as { greeting: string }).greeting;
  }
}

class Greeter extends IONode<any, any, { who: string }, { text: string }> {
  static override readonly type = "greeter";
  static override readonly configSchema = defineSchema(
    { source: SchemaType.NodeRef<Greeting>("greeting-config") },
    { $id: "greeter:config" },
  );
  override async input(msg: { who: string }) {
    const source = this.config.source as unknown as Greeting;
    this.send({ text: `${source.greeting}, ${msg.who}` });
  }
}

it("resolves a config node", async () => {
  const flow = runtime.flow();
  const greeting = flow.addNode(Greeting, { greeting: "hello" });
  const greeter = flow.addNode(Greeter, { source: greeting });
  await flow.deploy();

  await greeter.receive({ who: "world" });

  const out = (await greeter.read()) as { output: { text: string } };
  expect(out.output.text).toBe("hello, world");
});
```

**Wiring nodes together** — `read` the message at the downstream node:

```typescript
it("delivers a message across a wire", async () => {
  const flow = runtime.flow();
  const a = flow.addNode(Doubler, {});
  const b = flow.addNode(Relay, {});
  a.wire(b);
  await flow.deploy();

  await a.receive({ value: 5 });

  const relayed = (await b.read()) as { output: { relayed: boolean } };
  expect(relayed.output.relayed).toBe(true);
  expect(b.received().length).toBeGreaterThanOrEqual(1);
});
```

**Credentials** reach the deployed node via `addNode`'s third argument:

```typescript
it("passes credentials to the deployed node", async () => {
  const flow = runtime.flow();
  const node = flow.addNode(
    Secured,
    {},
    { credentials: { token: "secret-123" } },
  );
  await flow.deploy();

  await node.receive({});

  const out = (await node.read()) as { output: { token: string } };
  expect(out.output.token).toBe("secret-123");
});
```

**Context stores** — preset a value before driving the node, then assert what it stored:

```typescript
it("reads and writes real flow context", async () => {
  const flow = runtime.flow();
  const counter = flow.addNode(Counter, {});
  await flow.deploy();

  // preset the context before driving the node
  await counter.context.flow.set("count", 10);

  await counter.receive({});

  const out = (await counter.read()) as { output: { count: number } };
  expect(out.output.count).toBe(11);

  // assert the stored value directly
  expect(await counter.context.flow.get("count")).toBe(11);
});
```

Need to mock a network boundary (an SDK, an HTTP client)? `vi.mock` it at the top of the file as usual — the real config node, runtime, and wiring still run; only the outermost dependency is faked.

## Client Unit Testing

Client unit tests cover pure TypeScript logic — validation functions, formatters, utility modules, etc. They run in a [happy-dom](https://github.com/capricorn86/happy-dom) environment with mocked `RED` and `$` globals, but without rendering Vue components.

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest happy-dom
```

`happy-dom` provides the DOM environment the client unit config runs in (`environment: "happy-dom"`).

#### 2. Create a tsconfig

```json
// tests/client/unit/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/client/unit.json",
  "include": ["**/*.ts", "../../../src/client/**/*.ts"]
}
```

#### 3. Create a vitest config

```typescript
// vitest.client.unit.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/client/unit/config";

export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/client/unit/**/*.test.ts"],
    },
  }),
);
```

The `nrg` config provides:

- `testTimeout: 30_000`
- `environment: "happy-dom"` for `window`, `document`, and other browser globals
- `setupFiles` pointing to the built-in setup that installs `RED` and `$` mocks on `window`
- `@` alias pointing to `src/` in your project root
- `@bonsae/nrg/client` alias resolved to the test library (so `useFormNode` imports work without a runtime bundle)
- a default `include` of `tests/client/unit/**/*.test.ts`

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
import { describe, it, expect } from "vitest";
import { validateNode } from "../../../src/client/validation";

describe("validateNode", () => {
  it("returns true for valid config", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
      },
      required: ["name"],
    };
    const subject = { type: "my-node", name: "test" };

    expect(validateNode(subject, schema)).toBe(true);
  });

  it("returns errors for missing required field", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
      },
      required: ["name"],
    };
    const subject = { type: "my-node", name: "" };
    const result = validateNode(subject, schema);

    expect(result).not.toBe(true);
    expect(result).toContain("must NOT have fewer than 1 characters");
  });
});
```

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

NRG ships `@vitejs/plugin-vue` as a direct dependency; `@vitest/browser-playwright`, `vitest-browser-vue`, and `playwright` are optional peer dependencies — install them as shown in [Dependencies](#dependencies).

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

To test on a single browser only, override the `browser.instances` array:

```typescript
export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/client/component/**/*.test.ts"],
      browser: {
        instances: [{ browser: "chromium" }],
      },
    },
  }),
);
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

`playwright` is an optional peer dependency — install it as shown in [Dependencies](#dependencies).

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
