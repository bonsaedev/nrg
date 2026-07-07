import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";

// The node under test is TYPES-ONLY (no inputSchema/outputsSchema); its port
// topology lives only in its generics. In un-built source there is no
// `__nrgPorts` static, so without the harness's build-equivalent injection the
// node would report 0 outputs. Point the extractor at the fixture tree so
// `createNode` stamps the real topology — the same way
// `port-topology-injection.test.ts` does.
import Counter from "./fixtures/context-helper-test/ctx-counter";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/context-helper-test", import.meta.url),
);

describe("createNode context helper", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("presets and asserts flow context", async () => {
    const { node } = await createNode(Counter);

    await node.context.flow!.set("count", 10);

    await node.receive({});

    expect(
      (node.sent()[0][0] as { output: { count: number } }).output.count,
    ).toBe(11);
    expect(await node.context.flow!.get("count")).toBe(11);
  });
});
