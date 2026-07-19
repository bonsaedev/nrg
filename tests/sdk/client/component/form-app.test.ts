import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-vue";
import { defineComponent, h } from "vue";
import NodeRedVueApp from "@/sdk/lib/client/form/app.vue";
import NodeRedJsonSchemaForm from "@/sdk/lib/client/form/components/lib/node-red-json-schema-form.vue";
import { mountApp, unmountApp } from "@/sdk/lib/client/form";
import { createNode } from "@/sdk/test/client/component";
import type { NodeFeatures } from "@/sdk/lib/client/types";

const NO_FEATURES: NodeFeatures = {
  hasInput: false,
  outputPorts: [],
};

function nameSchema(extra: Record<string, any> = {}): any {
  return {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      ...extra,
    },
    required: ["name"],
    additionalProperties: true,
  };
}

function renderApp(options: {
  configs?: Record<string, any>;
  credentials?: Record<string, any>;
  defaults?: Record<string, any>;
  credentialDefs?: Record<string, any>;
  schema: any;
  features?: NodeFeatures;
  form?: any;
  defOutputs?: number;
}) {
  const { node } = createNode({ configs: options.configs ?? {} });
  node.credentials = { ...options.credentials };
  node._def = {
    // The registered top-level `outputs` = base ports + default-ON lifecycle
    // ports (see computeBuiltinPortOutputs). Overridable so a test can model a
    // node whose default-on port inflates it past the base.
    outputs: options.defOutputs ?? 1,
    defaults: options.defaults,
    credentials: options.credentialDefs,
  };
  const component = render(NodeRedVueApp, {
    props: {
      node: node as any,
      schema: options.schema,
      features: options.features ?? NO_FEATURES,
    },
    global: {
      components: {
        NodeRedNodeForm: options.form ?? NodeRedJsonSchemaForm,
      },
    },
  });
  return { node, component };
}

function toggleFor(container: HTMLElement, label: string): HTMLElement {
  const labels = Array.from(container.querySelectorAll(".nrg-toggle__label"));
  const el = labels.find((l) => l.textContent?.trim() === label);
  if (el) return el.closest("label.nrg-toggle") as HTMLElement;
  // Lifecycle-port toggles render no visible label (the name lives in the
  // table's Port column); fall back to the toggle's accessible name.
  const input = container.querySelector(
    `.nrg-toggle__input[aria-label="${label}"]`,
  );
  if (input) return input.closest("label.nrg-toggle") as HTMLElement;
  throw new Error(
    `Toggle "${label}" not found. Available: ${labels
      .map((l) => l.textContent?.trim())
      .join(", ")}`,
  );
}

describe("app shell — input validation", () => {
  test("renders the Validate Data toggle when the node has an input port", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: {
        hasInput: true,
        outputPorts: [],
      },
    });
    expect(toggleFor(component.container, "Validate Data")).toBeTruthy();
  });

  test("toggling Validate writes validateInput on the node", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", validateInput: false },
      schema: nameSchema(),
      features: {
        hasInput: true,
        outputPorts: [],
      },
    });

    toggleFor(component.container, "Validate Data")
      .querySelector("input")!
      .click();

    await vi.waitFor(() => {
      expect(node.validateInput).toBe(true);
    });
  });

  test("renders no Ports Settings section without schemas or ports", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
    });
    expect(component.container.querySelector(".nrg-section")).toBeNull();
  });
});

describe("app shell — built-in port toggles", () => {
  test("renders a toggle per declared port and recalculates outputs", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", errorPort: false, completePort: false },
      schema: nameSchema({
        errorPort: { type: "boolean" },
        completePort: { type: "boolean" },
      }),
      // One base output port — the recalc counts lifecycle ports ON TOP of this.
      features: { hasInput: false, outputPorts: [{ index: 0, label: "out" }] },
    });
    // Lifecycle rows label the port by its short name; the toggle keeps the
    // full "<name> Port" accessible name.
    expect(toggleFor(component.container, "Error Port")).toBeTruthy();
    expect(toggleFor(component.container, "Complete Port")).toBeTruthy();
    expect(
      component.container.querySelector('[aria-label="Status Port"]'),
    ).toBeNull();

    toggleFor(component.container, "Error Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.errorPort).toBe(true);
      expect(node.outputs).toBe(2); // base 1 + error port
    });

    toggleFor(component.container, "Complete Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.outputs).toBe(3);
    });

    toggleFor(component.container, "Error Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.errorPort).toBe(false);
      expect(node.outputs).toBe(2);
    });
  });

  test("statusPort toggle recalculates outputs too", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", statusPort: false },
      schema: nameSchema({ statusPort: { type: "boolean" } }),
      // One base output port — the status port counts on top of it.
      features: { hasInput: false, outputPorts: [{ index: 0, label: "out" }] },
    });

    toggleFor(component.container, "Status Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.statusPort).toBe(true);
      expect(node.outputs).toBe(2);
    });
  });

  test("recalculates from the base port count, not _def.outputs (default-on lifecycle port)", async () => {
    // A job-runner-style node: one base output ("Item") PLUS completePort ON by
    // default. Registration bakes the default-on port into `_def.outputs` (= 2).
    // Toggling ANY lifecycle port must recalc from the BASE (1) — not
    // `_def.outputs` — otherwise a phantom base port ("Output 1") appears in the
    // Outputs table and as an unlabeled port on the canvas.
    const { node, component } = renderApp({
      configs: {
        name: "x",
        errorPort: false,
        completePort: true,
        statusPort: false,
      },
      schema: nameSchema({
        errorPort: { type: "boolean" },
        completePort: { type: "boolean" },
        statusPort: { type: "boolean" },
      }),
      features: { hasInput: false, outputPorts: [{ index: 0, label: "Item" }] },
      defOutputs: 2, // base 1 + default-on completePort
    });
    const rowCount = () =>
      component.container.querySelectorAll(".nrg-outputs tbody tr").length;

    // Only the base "Item" row, though completePort is on and `_def.outputs` is 2.
    expect(rowCount()).toBe(1);

    // Enabling error: total = base(1) + error + complete = 3; still one base row.
    toggleFor(component.container, "Error Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.outputs).toBe(3);
      expect(rowCount()).toBe(1);
    });

    // Disabling the default-on complete port: total = base(1) + error = 2; still
    // one base row (the exact case the user hit).
    toggleFor(component.container, "Complete Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.outputs).toBe(2);
      expect(rowCount()).toBe(1);
    });
  });
});

// The build's extractor spreads the framework fields into EVERY IONode's config
// schema, so the editor renders the whole Ports Settings section even for a node
// that declared none of them (the SOQL-node case). This asserts the client end of
// that contract: given the merged schema, the full section renders.
describe("app shell — framework config fields (extractor-merged, always present)", () => {
  const frameworkSchema = () =>
    nameSchema({
      errorPort: { type: "boolean", default: false },
      completePort: { type: "boolean", default: false },
      statusPort: { type: "boolean", default: false },
    });

  test("renders Lifecycle from a merged schema the node didn't declare", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: frameworkSchema(),
      // No input port; one output port — ports come from types only.
      features: {
        hasInput: false,
        outputPorts: [{ index: 0, label: "out" }],
      },
    });

    // Lifecycle Output Ports — all three toggles.
    expect(toggleFor(component.container, "Error Port")).toBeTruthy();
    expect(toggleFor(component.container, "Complete Port")).toBeTruthy();
    expect(toggleFor(component.container, "Status Port")).toBeTruthy();

    // Outputs subsection — NO Validate Data column (nothing declares an output
    // schema to validate).
    const headers = Array.from(
      component.container.querySelectorAll(".nrg-outputs thead th"),
    ).map((th) => th.textContent?.trim());
    expect(headers).not.toContain("Validate Data");
  });
});

describe("app shell — Outputs table", () => {
  const OUT_FEATURES = (
    ports: { index: number; label: string }[],
  ): NodeFeatures => ({
    hasInput: false,
    outputPorts: ports,
  });

  test("renders a row per base output port with its label", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: OUT_FEATURES([
        { index: 0, label: "success" },
        { index: 1, label: "failure" },
      ]),
    });
    const rows = component.container.querySelectorAll(".nrg-outputs tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("success");
    expect(rows[1].textContent).toContain("failure");
  });

  test("omits the Outputs table when there are no base output ports", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: OUT_FEATURES([]),
    });
    expect(component.container.querySelector(".nrg-outputs")).toBeNull();
  });

  test("the validate toggle writes validateOutputs[port]", async () => {
    // The Validate Data column renders when the config schema declares
    // `outputSchemas` (framework-merged into every IONode in production).
    const { node, component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema({ outputSchemas: { type: "object", default: {} } }),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    const checkbox = component.container.querySelector(
      ".nrg-cell-flag input[type='checkbox']",
    ) as HTMLInputElement;
    checkbox.click();
    await vi.waitFor(() => {
      expect(node.validateOutputs).toEqual({ 0: true });
    });
  });

  test("grows and shrinks the rows when the node's output count changes (dynamic outputs)", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", outputs: 1 },
      schema: nameSchema(),
      features: OUT_FEATURES([{ index: 0, label: "Output 0" }]),
    });
    const rowCount = () =>
      component.container.querySelectorAll(".nrg-outputs tbody tr").length;

    expect(rowCount()).toBe(1);

    // a config field bumps the node's base output count -> table grows
    node.outputs = 3;
    await vi.waitFor(() => {
      expect(rowCount()).toBe(3);
      const rows = component.container.querySelectorAll(
        ".nrg-outputs tbody tr",
      );
      expect(rows[2].textContent).toContain("Output 2");
    });

    // ...and shrinks back when the count drops
    node.outputs = 2;
    await vi.waitFor(() => expect(rowCount()).toBe(2));
  });

  test("falls back to the static port count when outputs is inconsistent with lifecycle ports", () => {
    // outputs (1) < enabled lifecycle ports (2) — a flow that toggled ports
    // without updating `outputs`. The table must still show the base ports.
    const { component } = renderApp({
      configs: { name: "x", outputs: 1, errorPort: true, completePort: true },
      schema: nameSchema({
        errorPort: { type: "boolean" },
        completePort: { type: "boolean" },
      }),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    expect(
      component.container.querySelectorAll(".nrg-outputs tbody tr").length,
    ).toBe(1);
  });

  test("counts only base outputs, excluding enabled lifecycle ports", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", outputs: 1, errorPort: false },
      schema: nameSchema({ errorPort: { type: "boolean" } }),
      features: OUT_FEATURES([{ index: 0, label: "Output 0" }]),
    });
    expect(
      component.container.querySelectorAll(".nrg-outputs tbody tr").length,
    ).toBe(1);

    // enabling the error port bumps total outputs to 2, but the base count
    // (and therefore the table) stays at 1 row
    node.errorPort = true;
    node.outputs = 2;
    await vi.waitFor(() => {
      expect(
        component.container.querySelectorAll(".nrg-outputs tbody tr").length,
      ).toBe(1);
    });
  });
});

// A types-first node (like the SOQL node) gets its output ports from its TYPES.
// The Outputs subsection surfaces whenever the node has output ports. The
// Validate Data column stays hidden unless the config schema declares
// `outputSchemas` to validate against.
describe("app shell — Outputs table (types-first, no output schema)", () => {
  const TYPES_FIRST_FEATURES = (
    ports: { index: number; label: string }[],
  ): NodeFeatures => ({
    hasInput: false,
    outputPorts: ports,
  });

  test("hides the Validate Data column when there is no output schema to validate against", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: TYPES_FIRST_FEATURES([{ index: 0, label: "out" }]),
    });
    const headers = Array.from(
      component.container.querySelectorAll(".nrg-outputs thead th"),
    ).map((th) => th.textContent?.trim());
    expect(headers).not.toContain("Validate Data");
  });

  test("renders the Outputs table (Port + Label only) even when the node declares no output controls", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: TYPES_FIRST_FEATURES([{ index: 0, label: "out" }]),
    });
    // The Outputs section now renders whenever the node has output ports.
    expect(component.container.querySelector(".nrg-outputs")).not.toBeNull();
    // ...but only the always-present Port + Label columns — no optional controls.
    const headers = Array.from(
      component.container.querySelectorAll(".nrg-outputs thead th"),
    ).map((th) => th.textContent?.trim());
    expect(headers).not.toContain("Validate Data");
    expect(headers).not.toContain("Return Property");
    expect(
      component.container.querySelector(".nrg-outputs tbody tr")?.textContent,
    ).toContain("out");
  });
});

describe("app shell — state normalization", () => {
  test("normalizes legacy comma-separated strings for array props", () => {
    const { node } = renderApp({
      configs: { name: "x", tags: "a,b", recipients: "" },
      schema: nameSchema({
        tags: { type: "array", items: { type: "string" } },
        recipients: { type: "array", items: { type: "string" } },
      }),
    });
    expect(node.tags).toEqual(["a", "b"]);
    expect(node.recipients).toEqual([]);
  });

  test("masks stored passwords and restores them on unmount", () => {
    const { node, component } = renderApp({
      configs: { name: "x" },
      credentials: { has_apiKey: true, apiKey: "" },
      credentialDefs: { apiKey: { type: "password" } },
      schema: nameSchema(),
    });
    expect(node.credentials!.apiKey).toBe("__PWD__");

    component.unmount();
    expect(node.credentials!.apiKey).toBeUndefined();
  });

  test("keeps an undeployed password value visible", () => {
    const { node } = renderApp({
      configs: { name: "x" },
      credentials: { has_apiKey: true, apiKey: "still-here" },
      credentialDefs: { apiKey: { type: "password" } },
      schema: nameSchema(),
    });
    expect(node.credentials!.apiKey).toBe("still-here");
  });
});

describe("app shell — validation lifecycle", () => {
  test("opens with errors for an invalid initial state", () => {
    const { component } = renderApp({
      configs: { name: "" },
      schema: nameSchema(),
    });
    expect(
      component.container.querySelector(".node-red-vue-input-error-message")
        ?.textContent,
    ).toBeTruthy();
  });

  test("revalidates (debounced) when watched config props change", async () => {
    const { node, component } = renderApp({
      configs: { name: "" },
      defaults: { name: { value: "" } },
      schema: nameSchema(),
    });
    expect(
      component.container.querySelector(".node-red-vue-input-error-message")
        ?.textContent,
    ).toBeTruthy();

    node.name = "fixed";

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(".node-red-vue-input-error-message")
          ?.textContent ?? "",
      ).toBe("");
    });
  });

  test("credential watcher updates has_ flags for passwords", async () => {
    const { node } = renderApp({
      configs: { name: "x" },
      credentials: { apiKey: "initial", has_apiKey: true },
      credentialDefs: { apiKey: { type: "password" } },
      schema: nameSchema(),
    });

    node.credentials!.apiKey = "";

    await vi.waitFor(() => {
      expect(node.credentials!.has_apiKey).toBe(false);
    });

    node.credentials!.apiKey = "new-secret";

    await vi.waitFor(() => {
      expect(node.credentials!.has_apiKey).toBe(true);
    });
  });
});

describe("app shell — flow-author schema validation", () => {
  const INPUT_FEATURES: NodeFeatures = { hasInput: true, outputPorts: [] };
  const inputSchemaSchema = () =>
    nameSchema({
      validateInput: { type: "boolean", default: false },
      inputSchema: { type: "string", default: "" },
    });

  test("reddens the Schema icon and adds an error tooltip for an invalid input schema", () => {
    const { component } = renderApp({
      configs: { name: "x", validateInput: true, inputSchema: "{ not json" },
      schema: inputSchemaSchema(),
      features: INPUT_FEATURES,
    });
    // the Schema icon/button is flagged red...
    const btn = component.container.querySelector(
      ".nrg-schema-btn.nrg-schema-btn-error",
    );
    expect(btn).not.toBeNull();
    // ...and carries the message as a tooltip — no separate in-form error text
    expect(btn?.getAttribute("title")).toContain("Invalid JSON");
    expect(component.container.querySelector(".nrg-schema-error")).toBeNull();
  });

  test("no red icon and no tooltip for a valid input schema", () => {
    const { component } = renderApp({
      configs: {
        name: "x",
        validateInput: true,
        inputSchema: JSON.stringify({ type: "object" }),
      },
      schema: inputSchemaSchema(),
      features: INPUT_FEATURES,
    });
    expect(
      component.container.querySelector(".nrg-schema-btn-error"),
    ).toBeNull();
    const btn = component.container.querySelector(".nrg-schema-btn");
    expect(btn?.getAttribute("title")).toBeNull();
  });

  test("reddens an output-port Schema icon and adds an error tooltip", () => {
    const { component } = renderApp({
      configs: {
        name: "x",
        validateOutputs: { 0: true },
        outputSchemas: { 0: "{ bad json" },
      },
      schema: nameSchema({
        outputSchemas: { type: "object", default: {} },
      }),
      features: {
        hasInput: false,
        outputPorts: [{ index: 0, label: "success" }],
      },
    });
    // the output port's Schema icon is flagged red + tooltip carries the error
    const btn = component.container.querySelector(
      ".nrg-schema-btn.nrg-schema-btn-error",
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("title")).toContain("Invalid JSON");
    expect(component.container.querySelector(".nrg-schema-error")).toBeNull();
  });

  test("clears the red icon and tooltip once the invalid schema is corrected", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", validateInput: true, inputSchema: "{ bad" },
      defaults: {
        inputSchema: { value: "" },
        validateInput: { value: false },
      },
      schema: inputSchemaSchema(),
      features: INPUT_FEATURES,
    });
    expect(
      component.container.querySelector(".nrg-schema-btn-error"),
    ).not.toBeNull();

    node.inputSchema = JSON.stringify({ type: "object" });

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(".nrg-schema-btn-error"),
      ).toBeNull();
    });
  });
});

describe("app shell — custom form component", () => {
  test("renders the provided form component instead of the generated form", () => {
    const Probe = defineComponent({
      props: { node: { type: Object, required: true } },
      setup(props) {
        return () =>
          h("span", { class: "custom-probe" }, String(props.node.name));
      },
    });
    const { component } = renderApp({
      configs: { name: "custom!" },
      schema: nameSchema(),
      form: Probe,
    });
    expect(
      component.container.querySelector(".custom-probe")!.textContent,
    ).toBe("custom!");
  });
});

describe("mountApp / unmountApp", () => {
  const CONTAINER_ID = "nrg-app-mount-test";

  afterEach(() => {
    document.getElementById(CONTAINER_ID)?.remove();
  });

  function prepareNode(configs: Record<string, any>) {
    const { node } = createNode({ configs });
    node._def = { outputs: 1, defaults: {}, credentials: undefined };
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
    return { node, container };
  }

  test("mounts the generated form against a cloned node state", () => {
    const { node, container } = prepareNode({ name: "mounted" });

    mountApp(node as any, undefined, nameSchema(), NO_FEATURES, CONTAINER_ID);

    expect(node._app).toBeTruthy();
    expect(node._newState).toBeTruthy();
    expect(node._newState).not.toBe(node);
    expect(node._newState!.name).toBe("mounted");
    expect(
      container.querySelector<HTMLInputElement>("input[type='text']")!.value,
    ).toBe("mounted");

    // edits go to the clone, not the original node
    const input =
      container.querySelector<HTMLInputElement>("input[type='text']")!;
    input.value = "edited";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(node.name).toBe("mounted");

    unmountApp(node as any);
    expect(node._app).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  test("mounts a custom form component when provided", () => {
    const { node, container } = prepareNode({ name: "custom" });
    const Probe = defineComponent({
      setup() {
        return () => h("span", { class: "mount-probe" }, "custom form");
      },
    });

    mountApp(
      node as any,
      { component: Probe },
      nameSchema(),
      NO_FEATURES,
      CONTAINER_ID,
    );

    expect(container.querySelector(".mount-probe")!.textContent).toBe(
      "custom form",
    );
    unmountApp(node as any);
  });

  test("unmountApp is a no-op for nodes without a mounted app", () => {
    const { node } = createNode({});
    expect(() => unmountApp(node as any)).not.toThrow();
  });

  test("$i18n resolves through the node's translation function", () => {
    const { node, container } = prepareNode({ name: "x" });
    node._ = vi.fn((key: string) => key);

    mountApp(node as any, undefined, nameSchema(), NO_FEATURES, CONTAINER_ID);

    // resolveLabel and the generated form both consult $i18n -> node._
    expect(vi.mocked(node._).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(node._).mock.calls[0][0]).toContain(node._newState!.type);
    unmountApp(node as any);
  });
});
