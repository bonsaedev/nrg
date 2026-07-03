import { describe, it, expect } from "vitest";
import { createNode } from "@bonsae/nrg/test/server/unit";
import ExampleNode from "../../src/server/nodes/example";

// Runs the PUBLISHED server-unit toolkit (createNode) against a real node, from a
// packed install — exercises the shipped `defaultConfig`, the subpath exports,
// the include glob and the `@` alias, in a plain Node env (no browser flake).
describe("example-node (server-unit smoke)", () => {
  it("echoes its input through the packed createNode helper", async () => {
    const { node } = await createNode(ExampleNode);
    await node.receive({ value: 42 });
    const out = node.sent(0)[0].output as { value?: number };
    expect(out.value).toBe(42);
  });
});
