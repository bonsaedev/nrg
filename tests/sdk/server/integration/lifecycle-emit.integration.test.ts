import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { startRuntime, type Runtime } from "@/sdk/test/server/integration";
import SyncForwarder from "./fixtures/sync-forwarder";
import Completer from "./fixtures/completer";

// Regression guard for a lifecycle-emit routing bug.
//
// A built-in port auto-emit (complete/error/status) runs AFTER `await input()`,
// i.e. once the invocation's AsyncLocalStorage scope has already exited. When a
// parent node forwards synchronously into a child, Node-RED runs the child's
// handler while the PARENT's invocation store is still ambient — so the child's
// post-`await` complete/error emit used to route through the parent's `send`
// instead of its own, and never reached the child's own downstream wire. io-node
// now re-enters the child's invocation store for those emits.
//
//   forwarder ──next──► child (complete/error) ──► sink
//   (synchronous delivery — leaks the parent scope into the child's auto-emit)

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("lifecycle auto-emit routes through its own node (nested sync delivery)", () => {
  let runtime: Runtime;
  let prevSrc: string | undefined;

  beforeAll(async () => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURES_DIR;
    runtime = await startRuntime({ nodes: [SyncForwarder, Completer] });
  });

  afterAll(async () => {
    await runtime.stop();
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("delivers the child's complete frame to the child's own complete wire", async () => {
    const flow = runtime.flow();
    const forwarder = flow.addNode(SyncForwarder);
    const child = flow.addNode(Completer, { completePort: true });
    const sink = flow.addNode(SyncForwarder);

    forwarder.wire(child); // next → child (Node-RED delivers this synchronously)
    // Completer has one data output ("out"); with only the complete port enabled
    // it sits at slot 1. Wire it to the sink.
    child.wire(sink, 1); // child.complete → sink
    await flow.deploy();

    await forwarder.receive({ payload: "hello" });

    // Before the fix the child's complete leaked out through the forwarder's send
    // and never arrived here.
    await vi.waitFor(() => expect(sink.received()).toHaveLength(1), {
      timeout: 3000,
    });
    expect(sink.received()[0]).toMatchObject({
      handled: true,
      payload: "hello",
    });
  });

  it("delivers the child's error frame to the child's own error wire", async () => {
    const flow = runtime.flow();
    const forwarder = flow.addNode(SyncForwarder);
    const child = flow.addNode(Completer, {
      completePort: false,
      errorPort: true,
    });
    const sink = flow.addNode(SyncForwarder);

    forwarder.wire(child);
    // Only the error port enabled → it sits at slot 1 (after the "out" data port).
    child.wire(sink, 1); // child.error → sink
    await flow.deploy();

    await forwarder.receive({ payload: "boom" });

    await vi.waitFor(() => expect(sink.received()).toHaveLength(1), {
      timeout: 3000,
    });
    expect(sink.received()[0]).toMatchObject({
      error: { message: "kaboom" },
    });
  });
});
