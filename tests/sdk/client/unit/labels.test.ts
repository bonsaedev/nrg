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
  it("resolves the input port label from input.label", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode({ "my-node.input.label": "Record data" });
    expect(fn.call(node, 0)).toBe("Record data");
  });

  it("returns undefined when no match", () => {
    const fn = createDefaultInputLabels("my-node");
    const node = mockNode();
    expect(fn.call(node, 0)).toBeUndefined();
  });
});

describe("createDefaultOutputLabels", () => {
  it("resolves a named port label from outputs.<name>.label", () => {
    const fn = createDefaultOutputLabels(
      "my-node",
      ["success", "failure"],
      false,
      0,
    );
    const node = mockNode({
      "my-node.outputs.success.label": "Succeeded",
      "my-node.outputs.failure.label": "Failed",
    });
    expect(fn.call(node, 0)).toBe("Succeeded");
    expect(fn.call(node, 1)).toBe("Failed");
  });

  it("never leaks the raw port name as the label (regression: 'out')", () => {
    // The port NAME is only the lookup key — never the visible label. An
    // un-localized named port resolves to undefined (no canvas label), so a
    // bare type name like "out" is never shown.
    const fn = createDefaultOutputLabels("my-node", ["out"], false, 0);
    const node = mockNode();
    expect(fn.call(node, 0)).toBeUndefined();
  });

  it("falls back to the positional key for an index past the named ports", () => {
    const fn = createDefaultOutputLabels("my-node", ["success"], false, 0);
    const node = mockNode({ "my-node.outputs.1.label": "Second" });
    expect(fn.call(node, 1)).toBe("Second");
  });

  it("resolves a positional output from outputs.<index>.label", () => {
    // Positional/dynamic outputs have no names — resolved by index.
    const fn = createDefaultOutputLabels("my-node", undefined, false, 0);
    const node = mockNode({ "my-node.outputs.0.label": "Main" });
    expect(fn.call(node, 0)).toBe("Main");
  });

  it("does not leak onto built-in ports for an unnamed output (regression)", () => {
    // A single unnamed output must not name the base port or push the built-in
    // error port off by one. With no names the base port is unlabeled and the
    // error port stays "Error".
    const fn = createDefaultOutputLabels("my-node", undefined, true, 1);
    const node = mockNode({}, { errorPort: true });
    expect(fn.call(node, 0)).toBeUndefined();
    expect(fn.call(node, 1)).toBe("Error");
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

  it("falls through to the port label after builtin ports", () => {
    const fn = createDefaultOutputLabels("my-node", ["main"], true, 1);
    const node = mockNode(
      { "my-node.outputs.main.label": "Main" },
      { errorPort: true },
    );
    expect(fn.call(node, 0)).toBe("Main");
    expect(fn.call(node, 1)).toBe("Error");
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
      {
        "my-node.outputs.success.label": "Succeeded",
        "my-node.outputs.failure.label": "Failed",
      },
      { errorPort: true, completePort: true, statusPort: false },
    );
    // First two indices are named ports
    expect(fn.call(node, 0)).toBe("Succeeded");
    expect(fn.call(node, 1)).toBe("Failed");
    // Then builtin ports start at baseOutputs (2)
    expect(fn.call(node, 2)).toBe("Error");
    expect(fn.call(node, 3)).toBe("Complete");
    expect(fn.call(node, 4)).toBeUndefined();
  });
});
