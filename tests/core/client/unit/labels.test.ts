import { describe, it, expect } from "vitest";
import type { NodeRedNode } from "@/sdk/lib/client/types";
import {
  resolveI18n,
  createDefaultLabel,
  createDefaultPaletteLabel,
  createDefaultInputLabels,
  createDefaultOutputLabels,
} from "@/sdk/lib/client/labels";

function mockNode(
  i18n: Record<string, string> = {},
  overrides: Record<string, unknown> = {},
): NodeRedNode {
  return {
    name: "",
    type: "test-node",
    _: (k: string) => i18n[k] ?? k,
    ...overrides,
  } as NodeRedNode;
}

describe("resolveI18n", () => {
  it("returns first resolved key", () => {
    const node = mockNode({ "test.a": "A", "test.b": "B" });
    expect(resolveI18n(node, "test.a", "test.b")).toBe("A");
  });

  it("falls back to next key when first is unresolved", () => {
    const node = mockNode({ "test.b": "B" });
    expect(resolveI18n(node, "test.a", "test.b")).toBe("B");
  });

  it("returns undefined when no key resolves", () => {
    const node = mockNode();
    expect(resolveI18n(node, "test.a")).toBeUndefined();
  });
});

describe("createDefaultLabel", () => {
  it("returns name when set", () => {
    const label = createDefaultLabel("my-node");
    const node = mockNode({}, { name: "Custom Name" });
    expect(label.call(node)).toBe("Custom Name");
  });

  it("returns i18n label when name is empty", () => {
    const label = createDefaultLabel("my-node");
    const node = mockNode({ "my-node.label": "Translated" });
    expect(label.call(node)).toBe("Translated");
  });

  it("falls back to type when no i18n match", () => {
    const label = createDefaultLabel("my-node");
    const node = mockNode();
    expect(label.call(node)).toBe("my-node");
  });
});

describe("createDefaultPaletteLabel", () => {
  it("tries paletteLabel key first", () => {
    const fn = createDefaultPaletteLabel("my-node");
    const node = mockNode({
      "my-node.paletteLabel": "Palette",
      "my-node.label": "Label",
    });
    expect(fn.call(node)).toBe("Palette");
  });

  it("falls back to label key", () => {
    const fn = createDefaultPaletteLabel("my-node");
    const node = mockNode({ "my-node.label": "Label" });
    expect(fn.call(node)).toBe("Label");
  });

  it("falls back to type", () => {
    const fn = createDefaultPaletteLabel("my-node");
    const node = mockNode();
    expect(fn.call(node)).toBe("my-node");
  });
});

describe("createDefaultInputLabels", () => {
  it("tries indexed key first", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode({ "my-node.inputLabels.0": "Input 0" });
    expect(fn.call(node, 0)).toBe("Input 0");
  });

  it("falls back to singular key", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode({ "my-node.inputLabels": "Input" });
    expect(fn.call(node, 0)).toBe("Input");
  });

  it("returns undefined when no match", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode();
    expect(fn.call(node, 0)).toBeUndefined();
  });
});

describe("createDefaultOutputLabels", () => {
  it("returns named port labels from outputPortNames", () => {
    const fn = createDefaultOutputLabels(
      "my-node",
      ["success", "failure"],
      false,
      0,
    );
    const node = mockNode();
    expect(fn.call(node, 0)).toBe("success");
    expect(fn.call(node, 1)).toBe("failure");
  });

  it("falls through for index beyond the named ports", () => {
    const fn = createDefaultOutputLabels("my-node", ["success"], false, 0);
    const node = mockNode();
    expect(fn.call(node, 1)).toBeUndefined();
  });

  it("has no names for single/positional outputs (undefined)", () => {
    // single schemas (Object/Any/Union) and positional arrays resolve to
    // undefined outputPortNames server-side, so ports stay unnamed here
    const fn = createDefaultOutputLabels("my-node", undefined, false, 0);
    const node = mockNode();
    expect(fn.call(node, 0)).toBeUndefined();
  });

  it("does not leak onto built-in ports for an unnamed output (regression)", () => {
    // The Any-schema bug: a single output schema must not name the base port
    // or push the built-in error port off by one. With undefined names the
    // base port is unnamed and the error port stays "Error".
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode({}, { errorPort: true });
    expect(fn.call(node, 0)).toBeUndefined(); // was "description"
    expect(fn.call(node, 1)).toBe("Error"); // was "$id"
  });

  it("labels builtin ports by name", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode(
      {},
      { errorPort: true, completePort: true, statusPort: true },
    );
    expect(fn.call(node, 1)).toBe("Error");
    expect(fn.call(node, 2)).toBe("Complete");
    expect(fn.call(node, 3)).toBe("Status");
  });

  it("skips disabled builtin ports", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode(
      {},
      { errorPort: false, completePort: true, statusPort: false },
    );
    expect(fn.call(node, 1)).toBe("Complete");
    expect(fn.call(node, 2)).toBeUndefined();
  });

  it("falls through to i18n after builtin ports", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode(
      { "my-node.outputLabels.0": "Main" },
      {
        errorPort: true,
      },
    );
    expect(fn.call(node, 0)).toBe("Main");
    expect(fn.call(node, 1)).toBe("Error");
  });

  it("tries indexed then singular i18n keys", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, false, 0);
    const node = mockNode({ "my-node.outputLabels": "Output" });
    expect(fn.call(node, 0)).toBe("Output");
  });

  it("returns undefined when no match", () => {
    const fn = createDefaultOutputLabels("my-node", undefined, false, 0);
    const node = mockNode();
    expect(fn.call(node, 0)).toBeUndefined();
  });

  it("labels named ports then builtin ports in combined mode", () => {
    const fn = createDefaultOutputLabels(
      "my-node",
      ["success", "failure"],
      true,
      2,
    );
    const node = mockNode(
      {},
      { errorPort: true, completePort: true, statusPort: false },
    );
    // First two indices are named ports
    expect(fn.call(node, 0)).toBe("success");
    expect(fn.call(node, 1)).toBe("failure");
    // Then builtin ports start at baseOutputs (2)
    expect(fn.call(node, 2)).toBe("Error");
    expect(fn.call(node, 3)).toBe("Complete");
    expect(fn.call(node, 4)).toBeUndefined();
  });
});
