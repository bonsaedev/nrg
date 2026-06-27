import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-vue";
import { defineComponent, h } from "vue";
import NodeRedVueApp from "@/core/client/form/app.vue";
import NodeRedJsonSchemaForm from "@/core/client/form/components/node-red-json-schema-form.vue";
import { mountApp, unmountApp } from "@/core/client/form";
import { createNode } from "@/test/client/component";
import type { NodeFeatures } from "@/core/client/types";

const NO_FEATURES: NodeFeatures = {
  hasInputSchema: false,
  hasOutputSchema: false,
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
}) {
  const { node } = createNode({ configs: options.configs ?? {} });
  node.credentials = { ...options.credentials };
  node._def = {
    outputs: 1,
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
  if (!el) {
    throw new Error(
      `Toggle "${label}" not found. Available: ${labels
        .map((l) => l.textContent?.trim())
        .join(", ")}`,
    );
  }
  return el.closest("label.nrg-toggle") as HTMLElement;
}

describe("app shell — input validation", () => {
  test("renders the Validate toggle when an input schema is declared", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: {
        hasInputSchema: true,
        hasOutputSchema: false,
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
        hasInputSchema: true,
        hasOutputSchema: false,
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
    });
    expect(component.container.textContent).toContain("Error Port");
    expect(component.container.textContent).toContain("Complete Port");
    expect(component.container.textContent).not.toContain("Status Port");

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
    });

    toggleFor(component.container, "Status Port")
      .querySelector("input")!
      .click();
    await vi.waitFor(() => {
      expect(node.statusPort).toBe(true);
      expect(node.outputs).toBe(2);
    });
  });
});

describe("app shell — Outputs table", () => {
  const OUT_FEATURES = (
    ports: { index: number; label: string }[],
  ): NodeFeatures => ({
    hasInputSchema: false,
    hasOutputSchema: true,
    outputPorts: ports,
  });

  // schema that opts into the per-port Return Property column
  const RETURN_SCHEMA = () =>
    nameSchema({ outputReturnProperties: { type: "object", default: {} } });

  // schema that opts into the per-port Context Mode column; `def` is the
  // author's per-port default map — a port present here is editable, others
  // render `carry`, disabled.
  const CONTEXT_SCHEMA = (def: Record<number, string> = {}) =>
    nameSchema({ outputContextModes: { type: "object", default: def } });

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

  test("shows the Return Property column only when the schema declares it", () => {
    const withRP = renderApp({
      configs: { name: "x" },
      schema: RETURN_SCHEMA(),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    expect(withRP.component.container.textContent).toContain("Return Property");

    const withoutRP = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    expect(withoutRP.component.container.textContent).not.toContain(
      "Return Property",
    );
  });

  test("shows the Context Mode column only when the schema declares it", () => {
    // target the table headers — the subsection help text mentions the term
    // "Context Mode" regardless of whether the column is rendered
    const headers = (c: HTMLElement) =>
      Array.from(c.querySelectorAll(".nrg-outputs thead th")).map((th) =>
        th.textContent?.trim(),
      );

    const withCM = renderApp({
      configs: { name: "x" },
      schema: CONTEXT_SCHEMA(),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    expect(headers(withCM.component.container)).toContain("Context Mode");

    const withoutCM = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    expect(headers(withoutCM.component.container)).not.toContain(
      "Context Mode",
    );
  });

  test("the validate toggle writes validateOutputs[port]", async () => {
    const { node, component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    const checkbox = component.container.querySelector(
      ".nrg-outputs-flag input[type='checkbox']",
    ) as HTMLInputElement;
    checkbox.click();
    await vi.waitFor(() => {
      expect(node.validateOutputs).toEqual({ 0: true });
    });
  });

  test("editing the return property writes outputReturnProperties[port]", async () => {
    const { node, component } = renderApp({
      configs: { name: "x" },
      schema: RETURN_SCHEMA(),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    const input = component.container.querySelector(
      "input.nrg-outputs-return",
    ) as HTMLInputElement;
    input.value = "result";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(node.outputReturnProperties).toEqual({ 0: "result" });
    });
  });

  test("selecting a context mode writes outputContextModes[port]", async () => {
    // port 0 has a schema default, so its dropdown is editable
    const { node, component } = renderApp({
      configs: { name: "x", outputContextModes: { 0: "carry" } },
      schema: CONTEXT_SCHEMA({ 0: "carry" }),
      features: OUT_FEATURES([{ index: 0, label: "out" }]),
    });
    const select = component.container.querySelector(
      "select.nrg-outputs-context",
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    select.value = "trace";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(node.outputContextModes).toEqual({ 0: "trace" });
    });
  });

  test("locks a port with no schema default to carry (disabled)", () => {
    // only port 0 has a default — port 1 is locked to carry
    const { component } = renderApp({
      configs: { name: "x", outputContextModes: { 0: "trace" } },
      schema: CONTEXT_SCHEMA({ 0: "trace" }),
      features: OUT_FEATURES([
        { index: 0, label: "p0" },
        { index: 1, label: "p1" },
      ]),
    });
    const selects = component.container.querySelectorAll<HTMLSelectElement>(
      "select.nrg-outputs-context",
    );
    expect(selects.length).toBe(2);
    // port 0: editable, seeded to its declared default
    expect(selects[0].disabled).toBe(false);
    expect(selects[0].value).toBe("trace");
    // port 1: locked to carry
    expect(selects[1].disabled).toBe(true);
    expect(selects[1].value).toBe("carry");
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
