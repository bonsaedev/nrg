import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { startRuntime, type Runtime } from "@/sdk/test/server/integration";
import ErrorRouter from "../unit/fixtures/types-first/error-router";

// The fixture is TYPES-ONLY (no inputSchema/outputsSchema) — its ports live in
// its generics. startRuntime must stamp the build-time topology so the node
// registers with the right port count; point the extractor at the fixture tree.
const FIXTURE_DIR = fileURLToPath(
  new URL("../unit/fixtures/types-first", import.meta.url),
);

describe("types-only node in a real runtime", () => {
  let runtime: Runtime;
  let prevSrc: string | undefined;

  beforeAll(async () => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
    runtime = await startRuntime({ nodes: [ErrorRouter] });
  });

  afterAll(async () => {
    await runtime.stop();
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("registers the type-derived output port and routes a message", async () => {
    // Topology came from the generics, stamped by startRuntime — the production
    // build injector would derive the identical descriptor.
    expect(ErrorRouter.outputs).toBe(1);
    expect(ErrorRouter.inputs).toBe(1);

    const flow = runtime.flow();
    const node = flow.addNode(ErrorRouter, {});
    await flow.deploy();

    await node.receive({ payload: "ok" });

    const out = (await node.read()) as { value: number };
    expect(out.value).toBe(1);
    expect(node.sent()).toHaveLength(1);
  });
});
