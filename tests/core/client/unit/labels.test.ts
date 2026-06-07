import { describe, it, expect } from "vitest";
import {
  resolveI18n,
  createDefaultLabel,
  createDefaultPaletteLabel,
  createDefaultInputLabels,
  createDefaultOutputLabels,
} from "@/core/client/labels";

function mockNode(i18n: Record<string, string> = {}, overrides: any = {}) {
  return {
    name: "",
    type: "test-node",
    _: (k: string) => i18n[k] ?? k,
    ...overrides,
  };
}

describe("resolveI18n", () => {
  it("returns first resolved key", () => {
    const node = mockNode({ "test.a": "A", "test.b": "B" });
    expect(resolveI18n(node as any, "test.a", "test.b")).toBe("A");
  });

  it("falls back to next key when first is unresolved", () => {
    const node = mockNode({ "test.b": "B" });
    expect(resolveI18n(node as any, "test.a", "test.b")).toBe("B");
  });

  it("returns undefined when no key resolves", () => {
    const node = mockNode();
    expect(resolveI18n(node as any, "test.a")).toBeUndefined();
  });
});

describe("createDefaultLabel", () => {
  it("returns name when set", () => {
    const label = createDefaultLabel("my-node");
    const node = mockNode({}, { name: "Custom Name" });
    expect(label.call(node as any)).toBe("Custom Name");
  });

  it("returns i18n label when name is empty", () => {
    const label = createDefaultLabel("my-node");
    const node = mockNode({ "my-node.label": "Translated" });
    expect(label.call(node as any)).toBe("Translated");
  });

  it("falls back to type when no i18n match", () => {
    const label = createDefaultLabel("my-node");
    const node = mockNode();
    expect(label.call(node as any)).toBe("my-node");
  });
});

describe("createDefaultPaletteLabel", () => {
  it("tries paletteLabel key first", () => {
    const fn = createDefaultPaletteLabel("my-node");
    const node = mockNode({
      "my-node.paletteLabel": "Palette",
      "my-node.label": "Label",
    });
    expect(fn.call(node as any)).toBe("Palette");
  });

  it("falls back to label key", () => {
    const fn = createDefaultPaletteLabel("my-node");
    const node = mockNode({ "my-node.label": "Label" });
    expect(fn.call(node as any)).toBe("Label");
  });

  it("falls back to type", () => {
    const fn = createDefaultPaletteLabel("my-node");
    const node = mockNode();
    expect(fn.call(node as any)).toBe("my-node");
  });
});

describe("createDefaultInputLabels", () => {
  it("tries indexed key first", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode({ "my-node.inputLabels.0": "Input 0" });
    expect(fn.call(node as any, 0)).toBe("Input 0");
  });

  it("falls back to singular key", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode({ "my-node.inputLabels": "Input" });
    expect(fn.call(node as any, 0)).toBe("Input");
  });

  it("returns undefined when no match", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode();
    expect(fn.call(node as any, 0)).toBeUndefined();
  });
});

describe("createDefaultOutputLabels", () => {
  it("returns record-based port names", () => {
    const fn = createDefaultOutputLabels(
      "my-node",
      { success: {}, failure: {} },
      false,
      0,
    );
    const node = mockNode();
    expect(fn.call(node as any, 0)).toBe("success");
    expect(fn.call(node as any, 1)).toBe("failure");
  });

  it("falls through for index beyond record ports", () => {
    const fn = createDefaultOutputLabels("my-node", { success: {} }, false, 0);
    const node = mockNode();
    expect(fn.call(node as any, 1)).toBeUndefined();
  });

  it("skips record check for array-based outputsSchema", () => {
    const fn = createDefaultOutputLabels("my-node", [{}], false, 0);
    const node = mockNode();
    expect(fn.call(node as any, 0)).toBeUndefined();
  });

  it("skips record check for schema with type property", () => {
    const fn = createDefaultOutputLabels(
      "my-node",
      { type: "object", properties: {} },
      false,
      0,
    );
    const node = mockNode();
    expect(fn.call(node as any, 0)).toBeUndefined();
  });

  it("labels builtin ports by name", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode(
      {},
      { errorPort: true, completePort: true, statusPort: true },
    );
    expect(fn.call(node as any, 1)).toBe("Error");
    expect(fn.call(node as any, 2)).toBe("Complete");
    expect(fn.call(node as any, 3)).toBe("Status");
  });

  it("skips disabled builtin ports", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode(
      {},
      { errorPort: false, completePort: true, statusPort: false },
    );
    expect(fn.call(node as any, 1)).toBe("Complete");
    expect(fn.call(node as any, 2)).toBeUndefined();
  });

  it("falls through to i18n after builtin ports", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode({ "my-node.outputLabels.0": "Main" }, {
      errorPort: true,
    });
    expect(fn.call(node as any, 0)).toBe("Main");
    expect(fn.call(node as any, 1)).toBe("Error");
  });

  it("tries indexed then singular i18n keys", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, false, 0);
    const node = mockNode({ "my-node.outputLabels": "Output" });
    expect(fn.call(node as any, 0)).toBe("Output");
  });

  it("returns undefined when no match", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, false, 0);
    const node = mockNode();
    expect(fn.call(node as any, 0)).toBeUndefined();
  });
});
