# Testing a Node

NRG provides a test framework at `@bonsae/nrg/test` for unit and integration testing the **server-side logic** of your nodes with Vitest. This covers node lifecycle hooks, input/output handling, config resolution, credentials, context stores, and settings — everything that runs in the Node-RED runtime.

## Setup

### 1. Install Vitest

```bash
pnpm add -D vitest
```

### 2. Add test script

Add a test script to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### 3. Create a test file

Create your tests in a `tests/` directory (or anywhere — Vitest finds `*.test.ts` files automatically):

```
src/
  server/
    nodes/my-node.ts
tests/
  my-node.test.ts        ← test file
vitest.config.ts         ← optional
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

## Quick Start

```typescript
import { createNode } from "@bonsae/nrg/test";
import MyNode from "./nodes/my-node";

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

## API

### `createNode(NodeClass, options?)`

Creates a fully initialized node instance with mocked RED and Node-RED internals. Calls `registered()` and `created()` automatically.

**Options:**

| Option | Description |
| --- | --- |
| `config` | Node config object (merged with schema defaults) |
| `credentials` | Credentials object |
| `configNodes` | Map of `{ nodeId: nodeInstance }` for config node references |
| `settings` | `RED.settings` overrides |
| `overrides` | Low-level Node-RED node overrides (`id`, `wires`, etc.) |

**Returns:** `{ node, RED }`

### Node Test Helpers

Every node returned by `createNode` has these helpers:

| Method | Description |
| --- | --- |
| `node.receive(msg)` | Send a message through the node's `input()` handler |
| `node.close(removed?)` | Trigger the `closed()` lifecycle hook |
| `node.reset()` | Clear all captured sent messages, statuses, and logs |
| `node.sent()` | All raw messages passed to `send()` |
| `node.sent(port)` | Messages sent to a specific output port |
| `node.statuses()` | All `status()` calls |
| `node.logged(level?)` | Log messages, optionally filtered by level (`"info"`, `"warn"`, `"error"`, `"debug"`) |
| `node.warned()` | Warning messages |
| `node.errored()` | Error messages |

## Examples

```typescript
import { describe, it, expect } from "vitest";
import { createNode } from "@bonsae/nrg/test";
import MyNode from "../server/nodes/my-node";
import Splitter from "../server/nodes/splitter";
import RemoteServer from "../server/nodes/remote-server";

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
  it("should resolve TypedInput values", async () => {
    const { node } = await createNode(MyNode, {
      config: { target: { value: "payload", type: "msg" } },
    });

    await node.receive({ payload: "resolved-value" });
    expect(node.sent(0)).toEqual([{ payload: "resolved-value" }]);
  });
});

describe("config node references", () => {
  it("should resolve NodeRef to config node instance", async () => {
    const { node: server } = await createNode(RemoteServer, {
      config: { host: "localhost", port: 3000 },
      overrides: { id: "server-1" },
    });

    const { node } = await createNode(MyNode, {
      config: { server: "server-1" },
      configNodes: { "server-1": server },
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
      configSchema: ConfigsSchema,
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

## Coverage

| Feature | How to Test |
| --- | --- |
| Node creation | `await createNode(MyNode)` |
| Config defaults | Check `node.config.*` after creation |
| Custom config | Pass `config: { ... }` to `createNode` |
| `registered()` hook | Check `RED.log.*` after creation |
| `created()` hook | Check `node.logged()` after creation |
| `input()` handler | `await node.receive(msg)` |
| Single output | `node.sent(0)` |
| Multi-output | `node.sent(0)`, `node.sent(1)` |
| `closed()` hook | `await node.close()` |
| Status | `node.statuses()` |
| Logging | `node.logged()`, `node.warned()`, `node.errored()` |
| Credentials | Pass `credentials: { ... }` to `createNode` |
| Settings | Pass `settings: { ... }` to `createNode` |
| TypedInput | Set config with `{ value, type }`, trigger, check output |
| Config node refs | Use `configNodes` option with pre-created nodes |
| Context store | Node/flow/global stores persist across triggers |
| i18n | `node.i18n(key, subs)` — substitutions work automatically |
| Error handling | `expect(node.receive(...)).rejects.toThrow(...)` |
| Factory API | `createNode(defineIONode({ ... }))` |
| Reset state | `node.reset()` clears sent, statuses, and logs |
