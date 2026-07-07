import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { NrgError } from "@/sdk/lib/shared/errors";
import { createRED } from "@mocks/red";
import { createNode } from "@/sdk/test/server/unit";
import WithInput from "./fixtures/register-type-test/with-input";
import WithoutInput from "./fixtures/register-type-test/without-input";
import SingleOutput from "./fixtures/register-type-test/single-output";
import MultiOutputs from "./fixtures/register-type-test/multi-outputs";
import NoOutputs from "./fixtures/register-type-test/no-outputs";

async function getModules() {
  const { Node, IONode, ConfigNode } = await import("@/sdk/lib/server/nodes");
  const { registerType, registerTypes } =
    await import("@/sdk/lib/server/index");
  return { Node, IONode, ConfigNode, registerType, registerTypes };
}

// Port topology is TYPES-ONLY: a node's input/output ports come from its
// `Input`/`Output` generics, stamped as `__nrgPorts` by the build. The fixture
// nodes below carry no schema topology, so point the extractor at their source
// tree — `createNode` then stamps the same topology the build would inject.
const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/register-type-test", import.meta.url),
);

describe("registerType validation", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("should throw NrgError when class does not extend Node", async () => {
    const { registerType } = await getModules();
    const RED = createRED();

    class NotANode {
      static type = "bad-node";
    }

    await expect(registerType(RED, NotANode as any)).rejects.toThrow(NrgError);
    await expect(registerType(RED, NotANode as any)).rejects.toThrow(
      "must extend IONode or ConfigNode",
    );
  });

  it("should throw NrgError when type is not defined", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createRED();

    class NoType extends IONode {
      // missing static type
    }

    await expect(registerType(RED, NoType as any)).rejects.toThrow(NrgError);
    await expect(registerType(RED, NoType as any)).rejects.toThrow(
      "type must be provided",
    );
  });

  it("should throw NrgError for invalid color format", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createRED();

    class BadColor extends IONode {
      static override readonly type = "bad-color";
      static override readonly category = "function";
      static override readonly color = "red" as any; // not hex
    }

    await expect(registerType(RED, BadColor as any)).rejects.toThrow(NrgError);
    await expect(registerType(RED, BadColor as any)).rejects.toThrow(
      "must be a 6-digit hex color",
    );
  });

  it("should accept valid hex color and call RED.nodes.registerType", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createRED();

    class GoodColor extends IONode {
      static override readonly type = "good-color";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
    }

    await registerType(RED, GoodColor as any);
    expect(RED.nodes.registerType).toHaveBeenCalledWith(
      "good-color",
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("should derive inputs from the Input generic", async () => {
    // `createNode` stamps the build-time topology (from the fixture source),
    // after which the static getter reflects the type-derived input count: a
    // typed `Input` generic gives one input port, an untyped one gives none.
    await createNode(WithInput);
    await createNode(WithoutInput);

    expect(WithInput.inputs).toBe(1);
    expect(WithoutInput.inputs).toBe(0);
  });

  it("should derive outputs from the Output generic", async () => {
    // A single object output → one port, a positional tuple → one port per
    // element, an untyped `Output` → none. All read off the injected topology.
    await createNode(SingleOutput);
    await createNode(MultiOutputs);
    await createNode(NoOutputs);

    expect(SingleOutput.outputs).toBe(1);
    expect(MultiOutputs.outputs).toBe(3);
    expect(NoOutputs.outputs).toBe(0);
  });
});

describe("registerTypes schema $id uniqueness", () => {
  it("registers two nodes whose schemas got auto-generated $ids without collision", async () => {
    const { IONode, registerTypes } = await getModules();
    const { defineSchema, SchemaType } =
      await import("@/sdk/lib/shared/schemas");
    const RED = createRED();

    class NodeA extends IONode {
      static override readonly type = "node-a";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
      static override readonly configSchema = defineSchema({
        name: SchemaType.String(),
      });
    }

    class NodeB extends IONode {
      static override readonly type = "node-b";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
      static override readonly configSchema = defineSchema({
        name: SchemaType.String(),
      });
    }

    // No explicit $id: defineSchema gives each schema a unique one, so both
    // register cleanly — no collision to detect.
    await registerTypes([NodeA, NodeB] as any)(RED);

    const idA = (NodeA.configSchema as { $id?: string }).$id;
    const idB = (NodeB.configSchema as { $id?: string }).$id;
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });
});
