import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startRuntime, type Runtime } from "@/test/server/integration";
import { defineIONode, ConfigNode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/shared/schemas";

const Doubler = defineIONode({
  type: "int-doubler",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "int-doubler:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input(msg) {
    this.send({ doubled: (msg as Record<string, number>).value * 2 });
  },
});

class Greeting extends ConfigNode {
  static override readonly type = "greeting-config";
  static override readonly configSchema = defineSchema(
    {
      name: SchemaType.String({ default: "" }),
      greeting: SchemaType.String({ default: "hi" }),
    },
    { $id: "greeting-config:config" },
  );
  get greeting(): string {
    return (this.config as { greeting: string }).greeting;
  }
}

const Greeter = defineIONode({
  type: "greeter",
  configSchema: defineSchema(
    {
      name: SchemaType.String({ default: "" }),
      source: SchemaType.NodeRef<Greeting>("greeting-config", {}),
    },
    { $id: "greeter:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input(msg) {
    const source = this.config.source as unknown as Greeting;
    this.send({
      text: `${source.greeting}, ${(msg as Record<string, string>).who}`,
    });
  },
});

const Repeater = defineIONode({
  type: "repeater",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "repeater:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Any(),
  async input(msg) {
    const count = (msg as Record<string, number>).count;
    for (let i = 0; i < count; i++) this.send({ i });
  },
});

const Relay = defineIONode({
  type: "relay",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "relay:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input() {
    this.send({ relayed: true });
  },
});

// echoes its credentials, to verify they reach the deployed node
const Secured = defineIONode({
  type: "secured",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "secured:config" },
  ),
  credentialsSchema: defineSchema(
    { token: SchemaType.String({ default: "" }) },
    { $id: "secured:credentials" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input() {
    this.send({ token: this.credentials?.token });
  },
});

// increments a flow-context counter on every message
const Counter = defineIONode({
  type: "counter",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "counter:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input() {
    const n = (await this.context.flow.get<number>("count")) ?? 0;
    await this.context.flow.set("count", n + 1);
    this.send({ count: n + 1 });
  },
});

// Emits only AFTER an awaited macrotask (20ms). A single event-loop tick can't
// see the emission — receive() must settle on the node's done().
const Deferred = defineIONode({
  type: "deferred-emit",
  configSchema: defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "deferred-emit:config" },
  ),
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input(msg) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.send({ echoed: (msg as Record<string, unknown>).value });
  },
});

describe("server integration runtime", () => {
  let runtime: Runtime;

  beforeAll(async () => {
    runtime = await startRuntime({
      nodes: [
        Doubler,
        Greeting,
        Greeter,
        Repeater,
        Relay,
        Counter,
        Secured,
        Deferred,
      ],
    });
  });

  afterAll(async () => {
    await runtime.stop();
  });

  // Kept FIRST on purpose: Node-RED drops inline credentials on the very first
  // setFlows after start, so startRuntime primes the pipeline with a throwaway
  // deploy. If that priming regresses, this — the first real deploy — is where
  // it surfaces. Do not reorder below another deploying test.
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

  it("deploys a node in a real runtime and captures its output", async () => {
    const flow = runtime.flow();
    const node = flow.addNode(Doubler, {});
    await flow.deploy();

    await node.receive({ value: 21 });

    const out = (await node.read()) as { output: { doubled: number } };
    expect(out.output.doubled).toBe(42);
    expect(node.sent()).toHaveLength(1);
  });

  it("receive() settles after an awaited async input() — no read() needed", async () => {
    const flow = runtime.flow();
    const node = flow.addNode(Deferred);
    await flow.deploy();

    // NO read() — the point of the settle-on-done fix is that receive() itself
    // waits for the node to finish. The emission is behind a 20ms awaited
    // macrotask, which the old single-setImmediate settle would have missed.
    await node.receive({ value: "hi" });

    const sent = node.sent(0) as Array<{ output: { echoed: string } }>;
    expect(sent).toHaveLength(1);
    expect(sent[0].output.echoed).toBe("hi");
  });

  it("resolves a config node through a real NodeRef", async () => {
    const flow = runtime.flow();
    const greeting = flow.addNode(Greeting, { greeting: "hello" });
    const greeter = flow.addNode(Greeter, { source: greeting });
    await flow.deploy();

    await greeter.receive({ who: "world" });

    const out = (await greeter.read()) as { output: { text: string } };
    expect(out.output.text).toBe("hello, world");
  });

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

  it("preset and assert flow context", async () => {
    const flow = runtime.flow();
    const counter = flow.addNode(Counter, {});
    await flow.deploy();

    // preset the context before driving the node
    await counter.context.flow.set("count", 10);

    await counter.receive({});
    await counter.receive({});

    // the node read/incremented the real flow context...
    const count = async () =>
      ((await counter.read()) as { output: { count: number } }).output.count;
    expect(await count()).toBe(11);
    expect(await count()).toBe(12);

    // ...and we can assert the stored value directly
    expect(await counter.context.flow.get("count")).toBe(12);
  });

  it("reads multiple emissions in order", async () => {
    const flow = runtime.flow();
    const repeater = flow.addNode(Repeater, {});
    await flow.deploy();

    await repeater.receive({ count: 3 });

    const out = async () =>
      ((await repeater.read()) as { output: { i: number } }).output.i;
    expect(await out()).toBe(0);
    expect(await out()).toBe(1);
    expect(await out()).toBe(2);
    expect(repeater.sent()).toHaveLength(3);
  });
});
