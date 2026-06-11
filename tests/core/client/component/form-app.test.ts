import { describe, test, expect, vi, afterEach } from "vitest";
import { render } from "vitest-browser-vue";
import { defineComponent, h } from "vue";
import NodeRedVueApp from "@/core/client/form/app.vue";
import NodeRedJsonSchemaForm from "@/core/client/form/components/node-red-json-schema-form.vue";
import { mountApp, unmountApp } from "@/core/client/form";
import { createNode } from "@/test/client/component";

const NO_FEATURES = { hasInputSchema: false, hasOutputSchema: false };

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
  features?: { hasInputSchema: boolean; hasOutputSchema: boolean };
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

describe("app shell — validation toggles", () => {
  test("renders validate toggles only for declared schemas", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
      features: { hasInputSchema: true, hasOutputSchema: false },
    });
    expect(component.container.textContent).toContain("Validate Input");
    expect(component.container.textContent).not.toContain("Validate Output");
  });

  test("toggling writes validateInput/validateOutput on the node", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", validateInput: false, validateOutput: false },
      schema: nameSchema(),
      features: { hasInputSchema: true, hasOutputSchema: true },
    });

    toggleFor(component.container, "Validate Input")
      .querySelector("input")!
      .click();
    toggleFor(component.container, "Validate Output")
      .querySelector("input")!
      .click();

    await vi.waitFor(() => {
      expect(node.validateInput).toBe(true);
      expect(node.validateOutput).toBe(true);
    });
  });

  test("renders neither toggle row without schemas", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
    });
    expect(component.container.querySelector(".nrg-toggles-grid")).toBeNull();
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

describe("app shell — returnProperty", () => {
  const RETURN_SCHEMA = () =>
    nameSchema({
      returnProperty: {
        type: "string",
        pattern: "^[A-Za-z_$][A-Za-z0-9_$]*$",
        default: "output",
      },
    });

  test("seeds the schema default and hides the input when not overridden", () => {
    const { node, component } = renderApp({
      configs: { name: "x" },
      schema: RETURN_SCHEMA(),
    });
    expect(node.returnProperty).toBe("output");
    expect(component.container.textContent).toContain(
      "Override return prop key",
    );
    expect(component.container.textContent).not.toContain("Return key");
  });

  test("starts overridden when the stored key differs from the default", () => {
    const { component } = renderApp({
      configs: { name: "x", returnProperty: "result" },
      schema: RETURN_SCHEMA(),
    });
    expect(component.container.textContent).toContain("Return key");
    expect(
      component.container.querySelector<HTMLInputElement>(
        ".nrg-return-property input[type='text']",
      )!.value,
    ).toBe("result");
  });

  test("toggling override on shows the input; off resets to the default", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", returnProperty: "result" },
      schema: RETURN_SCHEMA(),
    });

    toggleFor(component.container, "Override return prop key")
      .querySelector("input")!
      .click();

    await vi.waitFor(() => {
      expect(node.returnProperty).toBe("output");
      expect(component.container.textContent).not.toContain("Return key");
    });
  });

  test("invalid keys surface a validation error on the input", async () => {
    const { node, component } = renderApp({
      configs: { name: "x", returnProperty: "result" },
      defaults: { returnProperty: { value: "output" } },
      schema: RETURN_SCHEMA(),
    });

    node.returnProperty = "1-bad-key";

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(
          ".nrg-return-property .node-red-vue-input-error-message",
        )?.textContent,
      ).toBeTruthy();
    });
  });

  test("does not render the row when the schema omits returnProperty", () => {
    const { component } = renderApp({
      configs: { name: "x" },
      schema: nameSchema(),
    });
    expect(component.container.textContent).not.toContain(
      "Override return prop key",
    );
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
