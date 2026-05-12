import { describe, it, expect } from "vitest";
import { NrgError } from "../../../../src/core/errors";
import { createNodeRedRuntime } from "../../../mocks/red";

async function getModules() {
  const { Node, IONode, ConfigNode } = await import(
    "../../../../src/core/server/nodes"
  );
  const { registerType } = await import("../../../../src/core/server/index");
  return { Node, IONode, ConfigNode, registerType };
}

describe("registerType validation", () => {
  it("should throw NrgError when class does not extend Node", async () => {
    const { registerType } = await getModules();
    const { RED } = createNodeRedRuntime();

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
    const { RED } = createNodeRedRuntime();

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
    const { RED } = createNodeRedRuntime();

    class BadColor extends IONode {
      static override readonly type = "bad-color";
      static override readonly category = "function";
      static override readonly color = "red" as any; // not hex
    }

    await expect(registerType(RED, BadColor as any)).rejects.toThrow(NrgError);
    await expect(registerType(RED, BadColor as any)).rejects.toThrow(
      "color must be in hex format",
    );
  });

  it("should accept valid hex color", async () => {
    const { IONode, registerType } = await getModules();
    const { RED } = createNodeRedRuntime();

    class GoodColor extends IONode {
      static override readonly type = "good-color";
      static override readonly category = "function";
      static override readonly color = "#a6bbcf";
    }

    await expect(
      registerType(RED, GoodColor as any),
    ).resolves.not.toThrow();
  });

  it("should derive inputs from inputSchema presence", async () => {
    const { IONode } = await getModules();
    const { SchemaType } = await import(
      "../../../../src/core/server/schemas"
    );

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
    const { SchemaType } = await import(
      "../../../../src/core/server/schemas"
    );

    class SingleOutput extends IONode {
      static override readonly type = "single-output";
      static override readonly category = "function";
      static override readonly outputsSchema = SchemaType.Object({});
    }

    class MultiOutputs extends IONode {
      static override readonly type = "multi-outputs";
      static override readonly category = "function";
      static override readonly outputsSchema = [SchemaType.Object({}), SchemaType.Object({}), SchemaType.Object({})];
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
