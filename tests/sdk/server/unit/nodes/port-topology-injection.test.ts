import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";
import ErrorRouter from "../fixtures/types-first/error-router";
import Passthrough from "../fixtures/types-first/passthrough";

// The fixture node is TYPES-ONLY (no inputSchema/outputsSchema); its topology
// lives only in its generics. In un-built source there is no `__nrgPorts` static,
// so without the harness's build-equivalent injection the node would report 0
// outputs and its error port would collapse onto the data-port index. Point the
// extractor at the fixture tree so createNode can stamp the real topology.
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/types-first", import.meta.url),
);

describe("port topology injection (types-only node behaves like a built node)", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("derives one input and one base output port from the generics", async () => {
    const { node } = await createNode(ErrorRouter);
    expect(node.baseOutputs).toBe(1); // 0 without injection (no outputsSchema)
  });

  it("routes a throw to the built-in error port, leaving the data port empty", async () => {
    const { node } = await createNode(ErrorRouter, {
      config: { errorPort: true },
    });

    // A raw throw rejects receive() AND routes to the error port.
    await expect(node.receive({ payload: "boom" })).rejects.toThrow("boom");

    // Error port sits AT index 1 (after the single base output) — only correct
    // when the base-output count came from the injected topology.
    expect(node.sent(0)).toHaveLength(0);
    expect(node.sent("error")[0].error).toMatchObject({
      name: "Error",
      message: "boom",
    });
  });

  it("emits a successful result on the base output port", async () => {
    const { node } = await createNode(ErrorRouter);

    await node.receive({ payload: "ok" });

    expect(node.sent(0)).toHaveLength(1);
    expect(node.sent(0)[0].output).toEqual({ value: 1 });
  });

  it("derives one output port from an explicit `unknown` output", async () => {
    // A dynamic-output node (Output = unknown) still has ONE port — so its
    // built-in error port routes at index 1, not on top of the data port.
    const { node } = await createNode(Passthrough, {
      config: { errorPort: true },
    });
    expect(node.baseOutputs).toBe(1);

    await expect(node.receive({ fail: true })).rejects.toThrow("nope");
    expect(node.sent(0)).toHaveLength(0);
    expect(node.sent("error")[0].error).toMatchObject({ message: "nope" });
  });
});
