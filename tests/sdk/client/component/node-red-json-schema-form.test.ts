import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedJsonSchemaForm from "@/sdk/lib/client/form/components/lib/node-red-json-schema-form.vue";
import { createNode } from "@/sdk/test/client/component";
import { getJQueryState } from "@/sdk/test/client/mocks/jquery";

describe("NodeRedJsonSchemaForm", () => {
  test("skips the built-in per-port output fields (rendered by the app shell)", () => {
    const { node } = createNode({ name: "n" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            name: { type: "string", title: "Name" },
            validateOutputs: {
              type: "object",
              title: "Validate Outputs",
              default: {},
            },
          },
        },
      },
    });
    // all framework-managed output fields are rendered by the app shell, not here
    expect(screen.container.textContent).not.toContain("Validate Outputs");
    expect(screen.container.querySelectorAll('input[type="text"]').length).toBe(
      1,
    ); // only "name"
  });

  test("renders string field as text input", async () => {
    const { node } = createNode({ name: "my-node" });
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
    });
    await expect.element(screen.getByText("Name")).toBeInTheDocument();
    const input = screen.container.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
  });

  test("renders number field as number input", async () => {
    const { node } = createNode({ timeout: 30 });
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
    });
    await expect.element(screen.getByText("Timeout")).toBeInTheDocument();
    const input = screen.container.querySelector('input[type="number"]');
    expect(input).not.toBeNull();
  });

  test("renders integer field as number input with step=1 and min from the schema", async () => {
    const { node } = createNode({ retries: 3 });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            retries: { type: "integer", title: "Retries", minimum: 0 },
          },
        },
      },
    });
    const input = screen.container.querySelector('input[type="number"]');
    expect(input).not.toBeNull();
    // integer → step of 1 (no decimals); minimum → min (no negatives)
    expect(input?.getAttribute("step")).toBe("1");
    expect(input?.getAttribute("min")).toBe("0");
  });

  test("a plain number field has no step (decimals allowed)", async () => {
    const { node } = createNode({ ratio: 1.5 });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: { ratio: { type: "number", title: "Ratio" } },
        },
      },
    });
    const input = screen.container.querySelector('input[type="number"]');
    expect(input?.getAttribute("step")).toBeNull();
  });

  test("renders boolean with toggle option as toggle", async () => {
    const { node } = createNode({ enabled: true });
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
    });
    const toggle = screen.container.querySelector(".nrg-toggle");
    expect(toggle).not.toBeNull();
  });

  test("renders boolean without toggle as checkbox", async () => {
    const { node } = createNode({ active: false });
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
    });
    const checkbox = screen.container.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    const toggle = screen.container.querySelector(".nrg-toggle");
    expect(toggle).toBeNull();
  });

  test("renders enum field as select input", async () => {
    const { node } = createNode({ color: "red" });
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
    });
    await expect.element(screen.getByText("Color")).toBeInTheDocument();
    const selectInput = screen.container.querySelector(
      "input.node-input-select",
    );
    expect(selectInput).not.toBeNull();
  });

  test("renders anyOf with const values as select input", async () => {
    const { node } = createNode({ mode: "fast" });
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
    });
    const selectInput = screen.container.querySelector(
      "input.node-input-select",
    );
    expect(selectInput).not.toBeNull();
  });

  test("renders array with enum items as multi-select", async () => {
    const { node } = createNode({ tags: ["a"] });
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
    });
    const selectInput = screen.container.querySelector(
      "input.node-input-select",
    );
    expect(selectInput).not.toBeNull();
  });

  test("renders typed input for object with value/type", async () => {
    const { node } = createNode({
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
    });
    const typedInput = screen.container.querySelector(
      "input.node-red-typed-input",
    );
    expect(typedInput).not.toBeNull();
  });

  test("renders config input for x-nrg-node-type", async () => {
    const { node } = createNode({ server: "cfg-1" });
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
    });
    const configInput = screen.container.querySelector("#node-input-server");
    expect(configInput).not.toBeNull();
  });

  test("skips system fields", async () => {
    const { node } = createNode({ name: "test", customField: "value" });
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
    });
    await expect.element(screen.getByText("Custom")).toBeInTheDocument();
    const allInputs = screen.container.querySelectorAll("input");
    expect(allInputs.length).toBe(1);
  });

  test("renders credential fields as text/password inputs", async () => {
    const { node } = createNode({
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
    });
    await expect.element(screen.getByText("API Key")).toBeInTheDocument();
    await expect.element(screen.getByText("Username")).toBeInTheDocument();
    const passwordInput = screen.container.querySelector(
      'input[type="password"]',
    );
    expect(passwordInput).not.toBeNull();
  });

  test("shows error message for a field", async () => {
    const { node } = createNode({ name: "" });
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
    });
    await expect
      .element(screen.getByText("Name is required"))
      .toBeInTheDocument();
  });

  test("renders password field for format:password", async () => {
    const { node } = createNode({ secret: "hidden" });
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
    });
    const passwordInput = screen.container.querySelector(
      'input[type="password"]',
    );
    expect(passwordInput).not.toBeNull();
  });

  test("renders array without enum as textarea (array-text)", async () => {
    const { node } = createNode({ items: ["one", "two"] });
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
    });
    const textarea = screen.container.querySelector("textarea");
    expect(textarea).not.toBeNull();
  });

  test("renders editor for string with editorLanguage", async () => {
    const { node } = createNode({ template: "<p>hello</p>" });
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
    });
    const editorWrapper = screen.container.querySelector(".editor-wrapper");
    expect(editorWrapper).not.toBeNull();
  });

  test("renders no fields for empty schema", async () => {
    const { node } = createNode();
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: { type: "object", properties: {} },
      },
    });
    const formRows = screen.container.querySelectorAll(".form-row");
    expect(formRows.length).toBe(0);
  });

  test("marks every non-Optional field with an asterisk, whatever its type", async () => {
    const { node } = createNode({ apiKey: "", note: "", count: 0 });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          // apiKey (string) and count (number) are non-Optional; note is
          // Optional (absent from required[]).
          required: ["apiKey", "count"],
          properties: {
            apiKey: { type: "string", title: "API Key" },
            note: { type: "string", title: "Note" },
            count: { type: "number", title: "Count" },
          },
        },
      },
    });
    // Both non-Optional fields get the `*` — the string AND the number — while
    // the Optional string does not. `*` means non-Optional, matching what AJV
    // enforces via `required[]` and what the help "Required" column shows.
    const asterisks = screen.container.querySelectorAll(".nrg-required");
    expect(asterisks.length).toBe(2);
  });

  test("marks a non-Optional enum (anyOf) field with an asterisk", async () => {
    const { node } = createNode({ mode: "default" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          // Enums serialize as `anyOf` with no `type`; the old string/array-only
          // rule skipped them, desyncing the `*` from the help/validation
          // `required[]`. Under the unified rule a non-Optional enum gets the `*`.
          required: ["mode"],
          properties: {
            mode: {
              title: "Mode",
              anyOf: [{ const: "default" }, { const: "bypassPermissions" }],
            },
          },
        },
      },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("resolves per-option labels from i18n, falling back to the raw value", async () => {
    const { node } = createNode({ mode: "bypassPermissions" });
    const screen = render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            mode: {
              title: "Permission mode",
              anyOf: [{ const: "default" }, { const: "bypassPermissions" }],
            },
          },
        },
      },
      global: {
        mocks: {
          // Resolve one option; leave the other unset so we exercise the
          // raw-value fallback. `$i18n` echoes the key when unmapped.
          $i18n: (key: string) =>
            key === "options.mode.bypassPermissions"
              ? "Full autonomy (no prompts)"
              : key,
        },
      },
    });
    const select = screen.container.querySelector("input.node-input-select")!;
    const options = getJQueryState(select).typedInput?.types?.[0]?.options as {
      value: string;
      label: string;
    }[];
    expect(options).toEqual([
      { value: "default", label: "default" },
      { value: "bypassPermissions", label: "Full autonomy (no prompts)" },
    ]);
  });

  test("object field: renders a Monaco JSON editor and parses to a real object", async () => {
    const { node } = createNode({ metadata: { version: "1.0" } });

    // The spy accumulates across tests, so snapshot the count and wait for THIS
    // render's createEditor call.
    const createEditor = window.RED.editor.createEditor as unknown as {
      mock: {
        calls: [{ mode?: string }][];
        results: {
          value: { getValue(): string; setValue(v: string): void };
        }[];
      };
    };
    const before = createEditor.mock.results.length;

    render(NodeRedJsonSchemaForm, {
      props: {
        node,
        schema: {
          type: "object",
          properties: {
            metadata: {
              type: "object",
              title: "Metadata",
              properties: { version: { type: "string" } },
            },
          },
        },
      },
    });

    // The object field renders a code editor (Monaco, JSON mode) — not a plain
    // text input that would store a never-parsed "[object Object]" string.
    await vi.waitFor(() =>
      expect(createEditor.mock.results.length).toBeGreaterThan(before),
    );
    const lastCall = createEditor.mock.calls.at(-1) as [{ mode?: string }];
    expect(lastCall[0].mode).toBe("json");
    const editor = createEditor.mock.results.at(-1)!.value;
    // initial content is the object serialized as JSON
    expect(editor.getValue()).toContain('"version"');

    // editing with valid JSON parses into a real object (so AJV type:"object"
    // validates and the saved value is an object, not a never-parsed string).
    editor.setValue('{ "version": "2.0", "enabled": true }');
    await vi.waitFor(() =>
      expect(node.metadata).toEqual({ version: "2.0", enabled: true }),
    );

    // invalid JSON keeps the raw string so the type error surfaces instead of
    // being silently swallowed.
    editor.setValue("{ not json");
    await vi.waitFor(() => expect(node.metadata).toBe("{ not json"));
  });
});
