import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedEditorInput from "@/core/client/form/components/node-red-editor-input.vue";
import { createNode } from "@/test/client/component";

describe("NodeRedEditorInput", () => {
  const { RED } = createNode();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("mounts without error", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: '{"key": "val"}' },
    });
    const wrapper = screen.container.querySelector(".editor-wrapper");
    expect(wrapper).not.toBeNull();
  });

  test("creates editor container with unique id", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "" },
    });
    const editorDiv = screen.container.querySelector(
      '[id^="node-red-editor-"]',
    );
    expect(editorDiv).not.toBeNull();
  });

  test("renders expand button", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "" },
    });
    const expandBtn = screen.container.querySelector(".expand-button");
    expect(expandBtn).not.toBeNull();
    const icon = expandBtn?.querySelector("i.fa.fa-expand");
    expect(icon).not.toBeNull();
  });

  test("calls RED.editor.createEditor with correct options", async () => {
    render(NodeRedEditorInput, {
      props: { value: "test content", language: "javascript" },
    });
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });
    const spy = RED.editor.createEditor as ReturnType<typeof vi.fn>;
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.mode).toBe("javascript");
    expect(call.value).toBe("test content");
    expect(call.id).toMatch(/^node-red-editor-/);
  });

  test("emits editor-ready with editor instance", async () => {
    const onEditorReady = vi.fn();
    render(NodeRedEditorInput, {
      props: {
        value: "",
        "onEditor-ready": onEditorReady,
      },
    });
    await vi.waitFor(() => {
      expect(onEditorReady).toHaveBeenCalled();
    });
    const editor = onEditorReady.mock.calls[0][0];
    expect(editor).toHaveProperty("getValue");
    expect(editor).toHaveProperty("setValue");
    expect(editor).toHaveProperty("destroy");
  });

  test("renders label when provided", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "", label: "Template" },
    });
    await expect.element(screen.getByText("Template")).toBeInTheDocument();
  });

  test("renders icon in label", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "", label: "Code", icon: "code" },
    });
    const icon = screen.container.querySelector("i.fa.fa-code");
    expect(icon).not.toBeNull();
  });

  test("shows error message", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "", error: "Invalid JSON" },
    });
    await expect
      .element(screen.getByText("Invalid JSON"))
      .toBeInTheDocument();
  });

  test("hides error when empty", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "", error: "" },
    });
    const errorDiv = screen.container.querySelector(
      ".node-red-vue-input-error-message",
    ) as HTMLElement | null;
    expect(errorDiv?.style.display).toBe("none");
  });

  test("shows required asterisk", async () => {
    const screen = render(NodeRedEditorInput, {
      props: { value: "", label: "Body", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("modelValue takes precedence over value", async () => {
    render(NodeRedEditorInput, {
      props: { modelValue: "from-model", value: "from-value" },
    });
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });
    const spy = RED.editor.createEditor as ReturnType<typeof vi.fn>;
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.value).toBe("from-model");
  });

  test("editor getValue/setValue work after mount (no reactive proxy freeze)", async () => {
    const onEditorReady = vi.fn();
    render(NodeRedEditorInput, {
      props: { value: "initial", "onEditor-ready": onEditorReady },
    });
    await vi.waitFor(() => {
      expect(onEditorReady).toHaveBeenCalled();
    });
    const editor = onEditorReady.mock.calls[0][0];
    expect(editor.getValue()).toBe("initial");
    editor.setValue("updated");
    expect(editor.getValue()).toBe("updated");
  });

  test("editor change handler fires and emits update events", async () => {
    let changeCb: (() => void) | null = null;
    const mockCreateEditor = vi
      .fn()
      .mockImplementation((options: any) => {
        let currentValue = options.value || "";
        return {
          getValue: () => currentValue,
          setValue: (val: string) => {
            currentValue = val;
          },
          getSession: () => ({
            on: (_event: string, cb: () => void) => {
              changeCb = cb;
            },
          }),
          focus: () => {},
          destroy: () => {},
          saveView: () => {},
          restoreView: () => {},
        };
      });
    (RED.editor.createEditor as any) = mockCreateEditor;

    const onUpdate = vi.fn();
    render(NodeRedEditorInput, {
      props: {
        value: "hello",
        "onUpdate:value": onUpdate,
      },
    });

    await vi.waitFor(() => {
      expect(mockCreateEditor).toHaveBeenCalled();
    });

    const editor = mockCreateEditor.mock.results[0].value;
    editor.setValue("world");
    expect(changeCb).not.toBeNull();
    changeCb!();

    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith("world");
    });
  });

  test("editor destroy on unmount does not throw", async () => {
    const destroySpy = vi.fn();
    const mockCreateEditor = vi.fn().mockImplementation((options: any) => ({
      getValue: () => options.value || "",
      setValue: () => {},
      getSession: () => ({ on: () => {} }),
      focus: () => {},
      destroy: destroySpy,
      saveView: () => {},
      restoreView: () => {},
    }));
    (RED.editor.createEditor as any) = mockCreateEditor;

    const screen = render(NodeRedEditorInput, {
      props: { value: "temp" },
    });
    await vi.waitFor(() => {
      expect(mockCreateEditor).toHaveBeenCalled();
    });

    screen.unmount();
    expect(destroySpy).toHaveBeenCalled();
  });
});
