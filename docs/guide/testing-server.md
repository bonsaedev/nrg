# Server Testing

Unit-test a node's logic in isolation with `createNode`, and integration-test it in a real in-process Node-RED runtime.

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

::: warning
Scope your test files with **`include`**, not `files`. The base tsconfig delivers the `node.sent()` typing via its own `files` array, and a child `files` **replaces** the base's (while `include` is additive) — so a child `files` silently drops the shim and `node.sent()` fails to type-check.
:::

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
import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
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
    // producing node (id/type/name/port) under `source`; the default passthrough
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
  //   async input(msg: MyNodeInput) {
  //     const value = await this.config.target.resolve(msg);
  //     this.send("out", { value });
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
    // A node whose two named ports come from the `Outputs<{ … }>` generic — the
    // types are the only source of topology. The harness stamps the same ports the
    // build injects, so `sent(name)` resolves by name (like `send(name, …)` in the
    // node).
    //   import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
    type RouterInput = Input<Port<{ payload: number }>>;
    type RouterOutputs = Outputs<{
      ok: Port<{ value: number }>;
      err: Port<{ reason: string }>;
    }>;
    class Router extends IONode<any, never, RouterInput, RouterOutputs> {
      static override readonly type = "router";
      override async input(msg: RouterInput) {
        if (msg.payload > 0) this.send("ok", { value: msg.payload });
        else this.send("err", { reason: "non-positive" });
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

class ErrorNode extends IONode<any, any, Input<Port<{ payload: string }>>> {
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

describe("named output ports (send by name)", () => {
  // Given a node whose two named ports come from a `Port<T>` Outputs generic:
  //
  //   type RouterInput = Input<Port<{ payload: number }>>;
  //   type RouterOutputs = Outputs<{
  //     success: Port<{ result: string }>;
  //     failure: Port<{ error: string }>;
  //   }>;
  //   class Router extends IONode<Config, any, RouterInput, RouterOutputs> {
  //     override async input(msg: RouterInput) {
  //       if (msg.payload >= this.config.threshold) this.send("success", { result: "passed" });
  //       else this.send("failure", { error: "below threshold" });
  //     }
  //   }

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
    class RateLimitedNode extends IONode<
      any,
      any,
      Input<Port<{ payload: string }>>
    > {
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
    type ReturningInput = Input<Port<{ payload: string }>>;
    class ReturningNode extends IONode<any, any, ReturningInput> {
      static override readonly type = "returning";
      override async input(msg: ReturningInput) {
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
| ---------------- | ------------------------------------------------------------ |
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

Whether the incoming message is attached under `input` depends on the [context mode](./message-model#context-modes): the default `passthrough` keeps the immediate previous message (flat and loop-safe), `reset` attaches nothing, and a send with no incoming message records no `input` frame regardless.
:::

### Examples

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startRuntime,
  type Runtime,
} from "@bonsae/nrg/test/server/integration";
import {
  IONode,
  ConfigNode,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

type DoublerInput = Input<Port<{ value: number }>>;
type DoublerOutputs = Outputs<{ out: Port<{ doubled: number }> }>;

class Doubler extends IONode<any, any, DoublerInput, DoublerOutputs> {
  static override readonly type = "doubler";
  override async input(msg: DoublerInput) {
    this.send("out", { doubled: msg.value * 2 });
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

type GreeterInput = Input<Port<{ who: string }>>;
type GreeterOutputs = Outputs<{ out: Port<{ text: string }> }>;

class Greeter extends IONode<any, any, GreeterInput, GreeterOutputs> {
  static override readonly type = "greeter";
  static override readonly configSchema = defineSchema(
    { source: SchemaType.NodeRef<Greeting>("greeting-config") },
    { $id: "greeter:config" },
  );
  override async input(msg: GreeterInput) {
    const source = this.config.source as unknown as Greeting;
    this.send("out", { text: `${source.greeting}, ${msg.who}` });
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
