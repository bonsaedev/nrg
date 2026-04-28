import { describe, it, expect } from "vitest";
import { NrgError } from "../../../../src/core/errors";
import { createMockRED } from "../../../mocks/red";

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
    const RED = createMockRED();

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
    const RED = createMockRED();

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
    const RED = createMockRED();

    class BadColor extends IONode {
      static override readonly type = "bad-color";
      static override readonly category = "function";
      static readonly color = "red"; // not hex
    }

    await expect(registerType(RED, BadColor as any)).rejects.toThrow(NrgError);
    await expect(registerType(RED, BadColor as any)).rejects.toThrow(
      "color must be in hex format",
    );
  });

  it("should accept valid hex color", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createMockRED();

    class GoodColor extends IONode {
      static override readonly type = "good-color";
      static override readonly category = "function";
      static readonly color = "#a6bbcf";
    }

    await expect(
      registerType(RED, GoodColor as any),
    ).resolves.not.toThrow();
  });

  it("should throw NrgError for invalid inputs value", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createMockRED();

    class BadInputs extends IONode {
      static override readonly type = "bad-inputs";
      static override readonly category = "function";
      static override readonly inputs = 5; // must be 0 or 1
    }

    await expect(registerType(RED, BadInputs as any)).rejects.toThrow(NrgError);
    await expect(registerType(RED, BadInputs as any)).rejects.toThrow(
      "inputs must be 0 or 1",
    );
  });

  it("should accept inputs of 0 or 1", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createMockRED();

    class ZeroInputs extends IONode {
      static override readonly type = "zero-inputs";
      static override readonly category = "function";
      static override readonly inputs = 0;
    }

    class OneInput extends IONode {
      static override readonly type = "one-input";
      static override readonly category = "function";
      static override readonly inputs = 1;
    }

    await expect(
      registerType(RED, ZeroInputs as any),
    ).resolves.not.toThrow();
    await expect(
      registerType(RED, OneInput as any),
    ).resolves.not.toThrow();
  });

  it("should throw NrgError for negative outputs", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createMockRED();

    class BadOutputs extends IONode {
      static override readonly type = "bad-outputs";
      static override readonly category = "function";
      static override readonly outputs = -1;
    }

    await expect(registerType(RED, BadOutputs as any)).rejects.toThrow(
      NrgError,
    );
    await expect(registerType(RED, BadOutputs as any)).rejects.toThrow(
      "outputs must be a positive integer",
    );
  });

  it("should accept zero or positive outputs", async () => {
    const { IONode, registerType } = await getModules();
    const RED = createMockRED();

    class ZeroOutputs extends IONode {
      static override readonly type = "zero-outputs";
      static override readonly category = "function";
      static override readonly outputs = 0;
    }

    class MultiOutputs extends IONode {
      static override readonly type = "multi-outputs";
      static override readonly category = "function";
      static override readonly outputs = 5;
    }

    await expect(
      registerType(RED, ZeroOutputs as any),
    ).resolves.not.toThrow();
    await expect(
      registerType(RED, MultiOutputs as any),
    ).resolves.not.toThrow();
  });
});
