import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { defineComponent, h } from "vue";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import { createNode, useFormNode } from "@/sdk/test/client/component";

const NAME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
  },
  required: ["name"],
  additionalProperties: true,
} as any;

const Probe = defineComponent({
  setup() {
    const { node, errors } = useFormNode();
    return () =>
      h("div", [
        h("span", { class: "probe-name" }, String(node.name ?? "")),
        node.show ? h("span", { class: "probe-conditional" }, "on") : null,
        h("span", { class: "probe-error" }, errors["node.name"] ?? ""),
      ]);
  },
});

describe("createNode", () => {
  test("legacy shorthand still works", () => {
    const { node, errors, provide } = createNode({ name: "x", custom: 1 });
    expect(node.name).toBe("x");
    expect(node.custom).toBe(1);
    expect(errors).toEqual({});
    expect(provide.__nrg_form_node).toBe(node);
  });

  test("validation does not coerce the reactive node (no phantom dirty)", () => {
    const ConfigSchema = defineSchema(
      { count: SchemaType.Number({ default: 0 }) },
      { $id: "create-node-test:no-coerce" },
    );
    // A number field arriving as a string (as HTML inputs emit it): validation
    // must NOT rewrite the reactive node's `count` to the number 5 — that
    // in-place coercion is what marked the flow dirty on open and reported a
    // phantom change on Done. It validates a throwaway clone instead.
    const { node, errors } = createNode({
      configs: { count: "5" as unknown as number },
      configSchema: ConfigSchema,
    });
    expect(node.count).toBe("5"); // untouched string, NOT coerced to 5
    expect(errors["node.count"]).toBeUndefined(); // still valid (clone coerced)
  });

  test("node mutations re-render dependent components", async () => {
    const { node, provide } = createNode({ name: "initial", show: false });
    const component = render(Probe, { global: { provide } });

    expect(component.container.querySelector(".probe-name")!.textContent).toBe(
      "initial",
    );
    expect(component.container.querySelector(".probe-conditional")).toBeNull();

    node.name = "updated";
    node.show = true;

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(".probe-name")!.textContent,
      ).toBe("updated");
      expect(
        component.container.querySelector(".probe-conditional"),
      ).not.toBeNull();
    });
  });

  test("configSchema populates errors for invalid initial state", () => {
    const { errors } = createNode({
      configs: { name: "" },
      configSchema: NAME_SCHEMA,
    });
    expect(errors["node.name"]).toBeDefined();
  });

  test("errors clear reactively when node becomes valid", async () => {
    const { node, errors } = createNode({
      configs: { name: "" },
      configSchema: NAME_SCHEMA,
    });
    expect(errors["node.name"]).toBeDefined();

    node.name = "valid";

    await vi.waitFor(() => {
      expect(errors["node.name"]).toBeUndefined();
    });
  });

  test("errors appear reactively when node becomes invalid", async () => {
    const { node, errors, provide } = createNode({
      configs: { name: "ok" },
      configSchema: NAME_SCHEMA,
    });
    expect(errors["node.name"]).toBeUndefined();
    const component = render(Probe, { global: { provide } });

    node.name = "";

    await vi.waitFor(() => {
      expect(errors["node.name"]).toBeDefined();
      expect(
        component.container.querySelector(".probe-error")!.textContent,
      ).not.toBe("");
    });
  });

  test("credentialsSchema errors are nested under credentials", () => {
    const { errors } = createNode({
      configs: { name: "x" },
      credentials: { token: "" },
      configSchema: NAME_SCHEMA,
      credentialsSchema: {
        type: "object",
        properties: { token: { type: "string", minLength: 1 } },
      } as any,
    });
    expect(errors["node.credentials.token"]).toBeDefined();
  });

  test("credential errors clear when fixed", async () => {
    const { node, errors } = createNode({
      configs: { name: "x" },
      credentials: { token: "" },
      configSchema: NAME_SCHEMA,
      credentialsSchema: {
        type: "object",
        properties: { token: { type: "string", minLength: 1 } },
      } as any,
    });
    expect(errors["node.credentials.token"]).toBeDefined();

    node.credentials!.token = "secret";

    await vi.waitFor(() => {
      expect(errors["node.credentials.token"]).toBeUndefined();
    });
  });

  test("NodeRef fields validate against fake nodes", () => {
    const schema = {
      type: "object",
      properties: {
        connection: {
          type: "string",
          format: "node-id",
          "x-nrg-node-type": "my-config",
          minLength: 1,
        },
      },
      additionalProperties: true,
    } as any;

    const missing = createNode({
      configs: { connection: "unknown-id" },
      configSchema: schema,
    });
    expect(missing.errors["node.connection"]).toBeDefined();

    const registered = createNode({
      configs: { connection: "cfg-1" },
      configSchema: schema,
      nodes: [{ id: "cfg-1", type: "my-config" }],
    });
    expect(registered.errors["node.connection"]).toBeUndefined();
  });

  test("different schemas in the same file do not collide", () => {
    const first = createNode({
      configs: { name: "" },
      configSchema: NAME_SCHEMA,
    });
    const second = createNode({
      configs: { count: "not-a-number" },
      configSchema: {
        type: "object",
        properties: { count: { type: "number" } },
        additionalProperties: true,
      } as any,
    });
    expect(first.errors["node.name"]).toBeDefined();
    expect(second.errors["node.count"]).toBeDefined();
    expect(second.errors["node.name"]).toBeUndefined();
  });

  test("does not mutate the caller's schema object", () => {
    const schema = JSON.parse(JSON.stringify(NAME_SCHEMA));
    createNode({ configs: { name: "" }, configSchema: schema });
    expect(schema.$id).toBeUndefined();
  });

  test("schemas with the same $id do not poison each other's validators", async () => {
    // real schema modules ship $id — the second composition must not reuse
    // the first's cached compile (which lacked the credentials branch)
    const ConfigsSchema = defineSchema(
      { name: SchemaType.String({ default: "" }) },
      { $id: "shared-id:configs" },
    );
    const CredentialsSchema = defineSchema(
      { token: SchemaType.String({ minLength: 1 }) },
      { $id: "shared-id:credentials" },
    );

    const first = createNode({
      configs: { name: "ok" },
      configSchema: ConfigsSchema,
    });
    expect(first.errors).toEqual({});

    const second = createNode({
      configs: { name: "ok" },
      credentials: { token: "" },
      configSchema: ConfigsSchema,
      credentialsSchema: CredentialsSchema,
    });
    expect(second.errors["node.credentials.token"]).toBeDefined();
  });

  test("accepts TypeBox schemas straight from server schema modules", async () => {
    const ConfigsSchema = defineSchema(
      {
        name: SchemaType.String({ minLength: 1 }),
      },
      { $id: "create-node-test:configs" },
    );
    const CredentialsSchema = defineSchema(
      {
        token: SchemaType.String({ minLength: 1 }),
      },
      { $id: "create-node-test:credentials" },
    );

    const { node, errors } = createNode({
      configs: { name: "" },
      credentials: { token: "" },
      configSchema: ConfigsSchema,
      credentialsSchema: CredentialsSchema,
    });
    expect(errors["node.name"]).toBeDefined();
    expect(errors["node.credentials.token"]).toBeDefined();

    node.name = "valid";
    node.credentials!.token = "secret";

    await vi.waitFor(() => {
      expect(errors["node.name"]).toBeUndefined();
      expect(errors["node.credentials.token"]).toBeUndefined();
    });
  });
});

describe("createNode schema resolution by node type", () => {
  // The fixture registry (tests/.../fixtures/schema-registry.ts) ships a
  // "fixture-node" with name>=1 (config) and token>=1 (credentials). The
  // schemas globalSetup serializes it and provides it to the browser; createNode
  // resolves it by type — no schema import, no server runtime in the browser.
  test("resolves the real schema for a node type from the globalSetup", async () => {
    const { node, errors } = createNode({
      type: "fixture-node",
      configs: { name: "" },
      credentials: { token: "" },
    });
    expect(errors["node.name"]).toBeDefined();
    expect(errors["node.credentials.token"]).toBeDefined();

    node.name = "valid";
    node.credentials!.token = "secret";

    await vi.waitFor(() => {
      expect(errors["node.name"]).toBeUndefined();
      expect(errors["node.credentials.token"]).toBeUndefined();
    });
  });

  test("an explicit configSchema overrides only config; credentials still resolve from the type", () => {
    const { errors } = createNode({
      type: "fixture-node",
      // "" would violate fixture-node's config schema (name>=1), but the
      // explicit schema below replaces it and only constrains `count`.
      configs: { name: "" },
      // empty token still violates fixture-node's credentials schema (token>=1),
      // which is resolved from the type because it wasn't passed explicitly.
      credentials: { token: "" },
      configSchema: {
        type: "object",
        properties: { count: { type: "number" } },
        additionalProperties: true,
      } as any,
    });
    expect(errors["node.name"]).toBeUndefined();
    expect(errors["node.credentials.token"]).toBeDefined();
  });

  test("an explicit credentialsSchema overrides only credentials; config still resolves from the type", () => {
    const { errors } = createNode({
      type: "fixture-node",
      // still constrained by fixture-node's config schema (name>=1) → error
      configs: { name: "" },
      // overridden by a creds schema with no minLength → empty token is valid
      credentials: { token: "" },
      credentialsSchema: {
        type: "object",
        properties: { token: { type: "string" } },
      } as any,
    });
    expect(errors["node.name"]).toBeDefined();
    expect(errors["node.credentials.token"]).toBeUndefined();
  });

  test("an unknown type resolves to no schema, so nothing validates", () => {
    const { errors } = createNode({
      type: "does-not-exist",
      configs: { name: "" },
    });
    expect(errors).toEqual({});
  });
});

describe("useFormNode", () => {
  test("throws a helpful error outside an NRG-mounted form", () => {
    const Probe = defineComponent({
      setup() {
        let message = "";
        try {
          useFormNode();
        } catch (e: any) {
          message = e.message;
        }
        return () => h("span", { class: "thrown" }, message);
      },
    });
    const component = render(Probe); // no provide on purpose
    expect(component.container.querySelector(".thrown")!.textContent).toContain(
      "useFormNode() must be called inside",
    );
  });
});

describe("errors", () => {
  test("direct mutations are reactive and components see them", async () => {
    const { errors, provide } = createNode({ name: "ok" });
    const component = render(Probe, { global: { provide } });

    errors["node.name"] = "Custom error";

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(".probe-error")!.textContent,
      ).toBe("Custom error");
    });

    delete errors["node.name"];

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(".probe-error")!.textContent,
      ).toBe("");
    });
  });
});
