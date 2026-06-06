import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedJsonSchemaForm from "../../../src/core/client/form/components/node-red-json-schema-form.vue";

function createNode(props: Record<string, any> = {}) {
  return {
    id: "node-1",
    type: "test-node",
    changed: false,
    _def: { outputs: 1 },
    name: "",
    _: (key: string) => key,
    ...props,
  };
}

const I18N_MOCK = {
  global: {
    mocks: {
      $i18n: (key: string) => key,
    },
  },
};

describe("NodeRedJsonSchemaForm", () => {
  test("renders string field as text input", async () => {
    const node = createNode({ name: "my-node" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            name: { type: "string", title: "Name" },
          },
        },
      },
      ...I18N_MOCK,
    });
    await expect.element(screen.getByText("Name")).toBeInTheDocument();
    const input = screen.container.querySelector(
      'input[type="text"]',
    );
    expect(input).not.toBeNull();
  });

  test("renders number field as number input", async () => {
    const node = createNode({ timeout: 30 });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            timeout: { type: "number", title: "Timeout" },
          },
        },
      },
      ...I18N_MOCK,
    });
    await expect.element(screen.getByText("Timeout")).toBeInTheDocument();
    const input = screen.container.querySelector(
      'input[type="number"]',
    );
    expect(input).not.toBeNull();
  });

  test("renders integer field as number input", async () => {
    const node = createNode({ retries: 3 });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            retries: { type: "integer", title: "Retries" },
          },
        },
      },
      ...I18N_MOCK,
    });
    const input = screen.container.querySelector(
      'input[type="number"]',
    );
    expect(input).not.toBeNull();
  });

  test("renders boolean with toggle option as toggle", async () => {
    const node = createNode({ enabled: true });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            enabled: {
              type: "boolean",
              title: "Enabled",
              "x-nrg-form": { toggle: true },
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const toggle = screen.container.querySelector(".nrg-toggle");
    expect(toggle).not.toBeNull();
  });

  test("renders boolean without toggle as checkbox", async () => {
    const node = createNode({ active: false });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            active: { type: "boolean", title: "Active" },
          },
        },
      },
      ...I18N_MOCK,
    });
    const checkbox = screen.container.querySelector(
      'input[type="checkbox"]',
    );
    expect(checkbox).not.toBeNull();
    const toggle = screen.container.querySelector(".nrg-toggle");
    expect(toggle).toBeNull();
  });

  test("renders enum field as select input", async () => {
    const node = createNode({ color: "red" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            color: {
              type: "string",
              title: "Color",
              enum: ["red", "green", "blue"],
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    await expect.element(screen.getByText("Color")).toBeInTheDocument();
    const selectInput = screen.container.querySelector(
      "input.node-input-select",
    );
    expect(selectInput).not.toBeNull();
  });

  test("renders anyOf with const values as select input", async () => {
    const node = createNode({ mode: "fast" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            mode: {
              title: "Mode",
              anyOf: [{ const: "fast" }, { const: "slow" }, { const: "auto" }],
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const selectInput = screen.container.querySelector(
      "input.node-input-select",
    );
    expect(selectInput).not.toBeNull();
  });

  test("renders array with enum items as multi-select", async () => {
    const node = createNode({ tags: ["a"] });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              title: "Tags",
              items: { enum: ["a", "b", "c"] },
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const selectInput = screen.container.querySelector(
      "input.node-input-select",
    );
    expect(selectInput).not.toBeNull();
  });

  test("renders typed input for object with value/type", async () => {
    const node = createNode({
      target: { value: "payload", type: "msg" },
    });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            target: {
              type: "object",
              title: "Target",
              properties: {
                value: { type: "string" },
                type: { type: "string" },
              },
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const typedInput = screen.container.querySelector(
      "input.node-red-typed-input",
    );
    expect(typedInput).not.toBeNull();
  });

  test("renders config input for x-nrg-node-type", async () => {
    const node = createNode({ server: "cfg-1" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              title: "Server",
              "x-nrg-node-type": "my-server-config",
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const configInput = screen.container.querySelector(
      "#node-input-server",
    );
    expect(configInput).not.toBeNull();
  });

  test("skips system fields", async () => {
    const node = createNode({ name: "test", customField: "value" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "string" },
            wires: { type: "array" },
            customField: { type: "string", title: "Custom" },
          },
        },
      },
      ...I18N_MOCK,
    });
    await expect.element(screen.getByText("Custom")).toBeInTheDocument();
    const allInputs = screen.container.querySelectorAll("input");
    expect(allInputs.length).toBe(1);
  });

  test("renders credential fields as text/password inputs", async () => {
    const node = createNode({
      credentials: { apiKey: "secret", username: "admin" },
    });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            credentials: {
              type: "object",
              properties: {
                apiKey: {
                  type: "string",
                  title: "API Key",
                  format: "password",
                },
                username: { type: "string", title: "Username" },
              },
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    await expect.element(screen.getByText("API Key")).toBeInTheDocument();
    await expect.element(screen.getByText("Username")).toBeInTheDocument();
    const passwordInput = screen.container.querySelector(
      'input[type="password"]',
    );
    expect(passwordInput).not.toBeNull();
  });

  test("shows error message for a field", async () => {
    const node = createNode({ name: "" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", title: "Name" },
          },
        },
        errors: { "node.name": "Name is required" },
      },
      ...I18N_MOCK,
    });
    await expect
      .element(screen.getByText("Name is required"))
      .toBeInTheDocument();
  });

  test("renders password field for format:password", async () => {
    const node = createNode({ secret: "hidden" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            secret: {
              type: "string",
              title: "Secret",
              format: "password",
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const passwordInput = screen.container.querySelector(
      'input[type="password"]',
    );
    expect(passwordInput).not.toBeNull();
  });

  test("renders array without enum as textarea (array-text)", async () => {
    const node = createNode({ items: ["one", "two"] });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            items: { type: "array", title: "Items" },
          },
        },
      },
      ...I18N_MOCK,
    });
    const textarea = screen.container.querySelector("textarea");
    expect(textarea).not.toBeNull();
  });

  test("renders editor for string with editorLanguage", async () => {
    const node = createNode({ template: "<p>hello</p>" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            template: {
              type: "string",
              title: "Template",
              "x-nrg-form": { editorLanguage: "html" },
            },
          },
        },
      },
      ...I18N_MOCK,
    });
    const editorWrapper = screen.container.querySelector(".editor-wrapper");
    expect(editorWrapper).not.toBeNull();
  });

  test("renders no fields for empty schema", async () => {
    const node = createNode();
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: { type: "object", properties: {} },
      },
      ...I18N_MOCK,
    });
    const formRows = screen.container.querySelectorAll(".form-row");
    expect(formRows.length).toBe(0);
  });
});
