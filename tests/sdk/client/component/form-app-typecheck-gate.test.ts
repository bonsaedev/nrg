import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedVueApp from "@/sdk/lib/client/form/app.vue";
import NodeRedJsonSchemaForm from "@/sdk/lib/client/form/components/lib/node-red-json-schema-form.vue";
import { createNode } from "@/sdk/test/client/component";
import { typeCheckEnabled } from "@/sdk/lib/client/wire-check/availability";
import type { NodeFeatures } from "@/sdk/lib/client/types";

// The user's requirement: the Validate Types control renders ONLY when BOTH the
// type-check plugin is installed (typeCheckEnabled) AND the node offers type
// validation — which the build signals by injecting the `validateInputTypes`
// default (present only for a node with a typed input). Validate DATA is
// unconditional; Validate TYPES needs plugin + node opt-in.

const INPUT_FEATURES: NodeFeatures = {
  hasInput: true,
  outputPorts: [],
};

/** Render the input form; `offersTypeValidation` = the build injected the flag. */
function renderInputForm(offersTypeValidation: boolean) {
  const { node } = createNode({
    configs: {
      name: "x",
      ...(offersTypeValidation ? { validateInputTypes: false } : {}),
    },
  });
  node._def = {
    outputs: 1,
    defaults: offersTypeValidation
      ? { validateInputTypes: { value: false } }
      : {},
    credentials: undefined,
  };
  const c = render(NodeRedVueApp, {
    props: {
      node: node as any,
      schema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: true,
      },
      features: INPUT_FEATURES,
    },
    global: { components: { NodeRedNodeForm: NodeRedJsonSchemaForm } },
  });
  return { node, c };
}

function hasToggle(container: HTMLElement, ariaLabel: string): boolean {
  return !!container.querySelector(
    `.nrg-toggle__input[aria-label="${ariaLabel}"]`,
  );
}

describe("Validate Types gate (plugin installed AND node offers it)", () => {
  afterEach(() => {
    typeCheckEnabled.value = false; // reset the module singleton
  });

  test("hidden with no plugin, even when the node offers it", () => {
    typeCheckEnabled.value = false;
    const { c } = renderInputForm(true);
    expect(hasToggle(c.container, "Validate Data")).toBe(true); // unconditional
    expect(hasToggle(c.container, "Validate Types")).toBe(false);
  });

  test("hidden when the plugin is installed but the node does NOT offer it", () => {
    typeCheckEnabled.value = true;
    const { c } = renderInputForm(false);
    expect(hasToggle(c.container, "Validate Data")).toBe(true);
    expect(hasToggle(c.container, "Validate Types")).toBe(false);
  });

  test("shown only when BOTH plugin installed AND node offers it, and writes the flag", async () => {
    typeCheckEnabled.value = false;
    const { node, c } = renderInputForm(true);
    expect(hasToggle(c.container, "Validate Types")).toBe(false);

    typeCheckEnabled.value = true;
    await vi.waitFor(() => {
      expect(hasToggle(c.container, "Validate Types")).toBe(true);
    });

    // toggling the gated control writes validateInputTypes on the node
    const input = c.container.querySelector(
      '.nrg-toggle__input[aria-label="Validate Types"]',
    ) as HTMLInputElement;
    input.click();
    await vi.waitFor(() => {
      expect((node as any).validateInputTypes).toBe(true);
    });
  });
});

const OUTPUT_FEATURES: NodeFeatures = {
  hasInput: false,
  outputPorts: [{ index: 0, label: "out" }],
};

/** Render an output form; `offersTypeValidation` = the build injected the
 *  per-port `validateOutputTypes` default (present only for a typed output). */
function renderOutputForm(offersTypeValidation: boolean) {
  const { node } = createNode({ configs: { name: "x" } });
  node._def = {
    outputs: 1,
    defaults: offersTypeValidation
      ? { validateOutputTypes: { value: {} } }
      : {},
    credentials: undefined,
  };
  const c = render(NodeRedVueApp, {
    props: {
      node: node as any,
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          // Framework-merged into every IONode in production; here it makes the
          // per-port Validate Data column render (asserted unconditional below).
          outputSchemas: { type: "object", default: {} },
        },
        required: ["name"],
        additionalProperties: true,
      },
      features: OUTPUT_FEATURES,
    },
    global: { components: { NodeRedNodeForm: NodeRedJsonSchemaForm } },
  });
  return { node, c };
}

describe("Validate Types gate — output ports (plugin installed AND node offers it)", () => {
  afterEach(() => {
    typeCheckEnabled.value = false; // reset the module singleton
  });

  test("hidden when the plugin is installed but the node does NOT offer it", () => {
    typeCheckEnabled.value = true;
    const { c } = renderOutputForm(false);
    expect(hasToggle(c.container, "Validate Data — out")).toBe(true); // unconditional
    expect(hasToggle(c.container, "Validate Types — out")).toBe(false);
  });

  test("renders the per-port Types toggle and writes validateOutputTypes when BOTH hold", async () => {
    typeCheckEnabled.value = true;
    const { node, c } = renderOutputForm(true);
    expect(hasToggle(c.container, "Validate Types — out")).toBe(true);

    // toggling the gated per-port control writes validateOutputTypes[port]
    const input = c.container.querySelector(
      '.nrg-toggle__input[aria-label="Validate Types — out"]',
    ) as HTMLInputElement;
    input.click();
    await vi.waitFor(() => {
      expect((node as any).validateOutputTypes).toEqual({ 0: true });
    });
  });
});
