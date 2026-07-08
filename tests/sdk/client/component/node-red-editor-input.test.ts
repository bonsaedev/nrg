import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedEditorInput from "@/sdk/lib/client/form/components/node-red-editor-input.vue";
import { createNode } from "@/sdk/test/client/component";

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

  test("forwards editorOptions to createEditor as `options`", async () => {
    const options = { lineNumbers: "on", minimap: { enabled: true } };
    render(NodeRedEditorInput, {
      props: { value: "{}", language: "json", editorOptions: options },
    });
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });
    const spy = RED.editor.createEditor as ReturnType<typeof vi.fn>;
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.options).toEqual(options);
  });

  test("passes options: undefined when none given (nrg imposes no default)", async () => {
    render(NodeRedEditorInput, { props: { value: "{}" } });
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });
    const spy = RED.editor.createEditor as ReturnType<typeof vi.fn>;
    const call = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(call.options).toBeUndefined();
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
    await expect.element(screen.getByText("Invalid JSON")).toBeInTheDocument();
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
    const mockCreateEditor = vi.fn().mockImplementation((options: any) => {
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
    // one-shot override so the shared factory reverts for later tests
    vi.mocked(RED.editor.createEditor).mockImplementationOnce(
      (options: any) => ({
        getValue: () => options.value || "",
        setValue: () => {},
        getSession: () => ({ on: () => {} }),
        focus: () => {},
        destroy: destroySpy,
        saveView: () => {},
        restoreView: () => {},
      }),
    );

    const screen = render(NodeRedEditorInput, {
      props: { value: "temp" },
    });
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalled();
    });

    screen.unmount();
    expect(destroySpy).toHaveBeenCalled();
  });
});

describe("NodeRedEditorInput expand tray", () => {
  const { RED } = createNode();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openExpandedTray(props: Record<string, any> = {}) {
    const onUpdate = vi.fn();
    const screen = render(NodeRedEditorInput, {
      props: {
        value: "initial code",
        language: "json",
        "onUpdate:value": onUpdate,
        ...props,
      },
    });
    // the inline editor is created on mount
    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalledTimes(1);
    });

    // Expand delegates to the shared NodeRedTray (the sole RED.tray.show caller).
    screen.container.querySelector<HTMLElement>(".expand-button")!.click();
    expect(RED.tray.show).toHaveBeenCalledTimes(1);
    const trayOptions = vi.mocked(RED.tray.show).mock.calls.at(-1)![0];

    // Simulate Node-RED mounting the tray DOM and invoking open(): NodeRedTray
    // captures the body and emits `open`, which schedules the expanded editor on
    // the next tick (once the teleported host div has rendered into the body).
    const trayEl = document.createElement("div");
    trayEl.innerHTML = '<div class="red-ui-tray-body"></div>';
    document.body.appendChild(trayEl);
    trayOptions.open(window.$(trayEl));

    await vi.waitFor(() => {
      expect(RED.editor.createEditor).toHaveBeenCalledTimes(2);
    });
    const expanded = vi.mocked(RED.editor.createEditor).mock.results.at(-1)!
      .value as ReturnType<typeof RED.editor.createEditor>;

    return { screen, trayOptions, trayEl, expanded, onUpdate };
  }

  test("open mounts an expanded editor seeded with the field value", async () => {
    const { trayOptions, trayEl, expanded } = await openExpandedTray();

    expect(expanded.getValue()).toBe("initial code");
    const lastCall = vi.mocked(RED.editor.createEditor).mock.calls.at(-1)![0];
    // A distinct, per-field host id, sharing the field's stateId for view state.
    expect(lastCall.id).toMatch(/^expanded-editor-/);
    expect(lastCall.mode).toBe("json");
    expect(lastCall.stateId).toBeTruthy();
    // The host div was teleported into the tray body.
    expect(trayEl.querySelector(".expanded-editor-host")).not.toBeNull();

    trayOptions.close();
    trayEl.remove();
  });

  test("Done copies the expanded value back into the inline editor", async () => {
    const { trayOptions, trayEl, expanded } = await openExpandedTray();
    const inline = vi.mocked(RED.editor.createEditor).mock.results[0]
      .value as ReturnType<typeof RED.editor.createEditor>;

    expanded.setValue("expanded edit");
    const done = trayOptions.buttons.find(
      (b: any) => b.id === "node-dialog-ok",
    );
    done.click();

    expect(RED.tray.close).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(inline.getValue()).toBe("expanded edit");
    });

    trayOptions.close();
    trayEl.remove();
  });

  test("Cancel closes the tray without copying the value", async () => {
    const { trayOptions, trayEl, expanded, onUpdate } =
      await openExpandedTray();

    expanded.setValue("discarded");
    const cancel = trayOptions.buttons.find(
      (b: any) => b.id === "node-dialog-cancel",
    );
    cancel.click();

    expect(RED.tray.close).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalledWith("discarded");

    trayOptions.close();
    trayEl.remove();
  });

  test("closing the tray destroys the expanded editor", async () => {
    const { trayOptions, trayEl, expanded } = await openExpandedTray();
    const destroySpy = vi.spyOn(expanded, "destroy");

    // NodeRedTray's close (fired by RED after the animation) tears the editor down.
    trayOptions.close();
    expect(destroySpy).toHaveBeenCalled();

    trayEl.remove();
  });

  test("destroys the expanded editor when unmounted while the tray is open", async () => {
    const { screen, trayOptions, trayEl, expanded } = await openExpandedTray();
    const destroySpy = vi.spyOn(expanded, "destroy");

    // Tear the field down WITHOUT closing the tray first (e.g. the whole form
    // is unmounted mid-edit). beforeUnmount is then the only path that disposes
    // the expanded Monaco — a real leak vector if it regresses.
    screen.unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);

    trayOptions.close();
    trayEl.remove();
  });
});
