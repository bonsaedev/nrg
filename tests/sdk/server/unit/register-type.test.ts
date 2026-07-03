import { describe, it, expect } from "vitest";
import { NrgError } from "@/sdk/lib/shared/errors";
import { createRED } from "@mocks/red";

async function getModules() {
  const { Node, IONode, ConfigNode } = await import("@/sdk/lib/server/nodes");
  const { registerType, registerTypes } =
    await import("@/sdk/lib/server/index");
  return { Node, IONode, ConfigNode, registerType, registerTypes };
}

describe("registerType validation", () => {
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

  it("should derive inputs from inputSchema presence", async () => {
    const { IONode } = await getModules();
    const { SchemaType } = await import("@/sdk/lib/shared/schemas");

    class WithInput extends IONode {
      static override readonly type = "with-input";
      static override readonly category = "function";
      static override readonly inputSchema = SchemaType.Object({});
    }

    class WithoutInput extends IONode {
      static override readonly type = "without-input";
      static override readonly category = "function";
    }

    expect(WithInput.inputs).toBe(1);
    expect(WithoutInput.inputs).toBe(0);
  });

  it("should derive outputs from outputsSchema", async () => {
    const { IONode } = await getModules();
    const { SchemaType } = await import("@/sdk/lib/shared/schemas");

    class SingleOutput extends IONode {
      static override readonly type = "single-output";
      static override readonly category = "function";
      static override readonly outputsSchema = SchemaType.Object({});
    }

    class MultiOutputs extends IONode {
      static override readonly type = "multi-outputs";
      static override readonly category = "function";
      static override readonly outputsSchema = [
        SchemaType.Object({}),
        SchemaType.Object({}),
        SchemaType.Object({}),
      ];
    }

    class NoOutputs extends IONode {
      static override readonly type = "no-outputs";
      static override readonly category = "function";
    }

    expect(SingleOutput.outputs).toBe(1);
    expect(MultiOutputs.outputs).toBe(3);
    expect(NoOutputs.outputs).toBe(0);
  });
});

describe("registerTypes schema $id enforcement", () => {
  it("throws NrgError when two nodes declare the same schema $id", async () => {
    const { IONode, registerTypes } = await getModules();
    const { defineSchema, SchemaType } =
      await import("@/sdk/lib/shared/schemas");
    const RED = createRED();

    const shared = defineSchema(
      { name: SchemaType.String() },
      { $id: "shared:configs" },
    );

    class NodeA extends IONode {
      static override readonly type = "node-a";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
      static override readonly configSchema = defineSchema(
        { name: SchemaType.String() },
        { $id: "shared:configs" },
      );
    }

    class NodeB extends IONode {
      static override readonly type = "node-b";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
      static override readonly configSchema = shared;
    }

    await expect(registerTypes([NodeA, NodeB] as any)(RED)).rejects.toThrow(
      NrgError,
    );
    await expect(registerTypes([NodeA, NodeB] as any)(RED)).rejects.toThrow(
      'Duplicate schema $id "shared:configs"',
    );
  });

  it("warns for a schema with properties but no $id (raw SchemaType.Object)", async () => {
    const { IONode, registerTypes } = await getModules();
    const { SchemaType } = await import("@/sdk/lib/shared/schemas");
    const RED = createRED();

    class RawSchemaNode extends IONode {
      static override readonly type = "raw-schema-node";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
      // A raw object schema (no $id) where defineSchema was intended.
      static override readonly configSchema = SchemaType.Object({
        name: SchemaType.String(),
      });
    }

    await registerTypes([RawSchemaNode] as any)(RED);

    expect(RED.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("raw-schema-node.config schema has properties"),
    );
  });

  it("does not warn for an empty schema without $id", async () => {
    const { IONode, registerTypes } = await getModules();
    const { SchemaType } = await import("@/sdk/lib/shared/schemas");
    const RED = createRED();

    class EmptyInputNode extends IONode {
      static override readonly type = "empty-input-node";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
      static override readonly inputSchema = SchemaType.Object({});
    }

    await registerTypes([EmptyInputNode] as any)(RED);

    const warnedAboutId = (RED.log.warn as any).mock.calls.some(
      (args: unknown[]) =>
        typeof args[0] === "string" && args[0].includes("no $id"),
    );
    expect(warnedAboutId).toBe(false);
  });
});
