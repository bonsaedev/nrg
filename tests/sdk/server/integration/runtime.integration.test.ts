import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { startRuntime, type Runtime } from "@/sdk/test/server/integration";
import Doubler from "../unit/fixtures/runtime-integration/int-doubler";
import Greeting from "../unit/fixtures/runtime-integration/greeting-config";
import Greeter from "../unit/fixtures/runtime-integration/greeter";
import Repeater from "../unit/fixtures/runtime-integration/repeater";
import Relay from "../unit/fixtures/runtime-integration/relay";
import Secured from "../unit/fixtures/runtime-integration/secured";
import Counter from "../unit/fixtures/runtime-integration/counter";
import Deferred from "../unit/fixtures/runtime-integration/deferred-emit";

// The fixture nodes are TYPES-ONLY (no inputSchema/outputsSchema); their port
// topology lives only in their generics. Point the extractor at the fixture tree
// so startRuntime stamps the build-time topology and the deployed nodes register
// with the right port count — exactly as a built node would (see port-topology).
const FIXTURE_DIR = fileURLToPath(
  new URL("../unit/fixtures/runtime-integration", import.meta.url),
);

describe("server integration runtime", () => {
  let runtime: Runtime;
  let prevSrc: string | undefined;

  beforeAll(async () => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
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
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
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

    const out = (await node.read()) as { token: string };
    expect(out.token).toBe("secret-123");
  });

  it("deploys a node in a real runtime and captures its output", async () => {
    const flow = runtime.flow();
    const node = flow.addNode(Doubler, {});
    await flow.deploy();

    await node.receive({ value: 21 });

    const out = (await node.read()) as { doubled: number };
    expect(out.doubled).toBe(42);
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

    const sent = node.sent(0) as Array<{ echoed: string }>;
    expect(sent).toHaveLength(1);
    expect(sent[0].echoed).toBe("hi");
  });

  it("resolves a config node through a real NodeRef", async () => {
    const flow = runtime.flow();
    const greeting = flow.addNode(Greeting, { greeting: "hello" });
    const greeter = flow.addNode(Greeter, { source: greeting });
    await flow.deploy();

    await greeter.receive({ who: "world" });

    const out = (await greeter.read()) as { text: string };
    expect(out.text).toBe("hello, world");
  });

  it("delivers a message across a wire", async () => {
    const flow = runtime.flow();
    const a = flow.addNode(Doubler, {});
    const b = flow.addNode(Relay, {});
    a.wire(b);
    await flow.deploy();

    await a.receive({ value: 5 });

    const relayed = (await b.read()) as { relayed: boolean };
    expect(relayed.relayed).toBe(true);
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
      ((await counter.read()) as { count: number }).count;
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

    const out = async () => ((await repeater.read()) as { i: number }).i;
    expect(await out()).toBe(0);
    expect(await out()).toBe(1);
    expect(await out()).toBe(2);
    expect(repeater.sent()).toHaveLength(3);
  });
});
