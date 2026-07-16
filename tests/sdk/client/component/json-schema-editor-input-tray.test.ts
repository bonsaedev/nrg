import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-vue";
import type { PropType } from "vue";
import { defineComponent } from "vue";
import JsonSchemaEditorInputTray from "@/sdk/lib/client/form/components/app/json-schema-editor-input-tray.vue";
import { createNode } from "@/sdk/test/client/component";

describe("JsonSchemaEditorInputTray", () => {
  const { RED } = createNode();
  let trayEl: HTMLElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    trayEl?.remove();
    trayEl = null;
  });

  const Harness = defineComponent({
    components: { JsonSchemaEditorInputTray },
    props: {
      title: { type: String, default: "" },
      value: { type: String, default: "" },
      onSave: {
        type: Function as PropType<(value: string) => void>,
        default: () => {},
      },
    },
    mounted() {
      (this.$refs.tray as InstanceType<typeof JsonSchemaEditorInputTray>).open(
        this.title,
        this.value,
        this.onSave,
      );
    },
    template: `<JsonSchemaEditorInputTray ref="tray" />`,
  });

  // Mount the tray and simulate Node-RED mounting its DOM + invoking open(),
  // mirroring the editor-input expand-tray test: NodeRedTray is the sole
  // RED.tray.show caller, so read the captured options off the spy and drive
  // open() with a real jQuery-wrapped tray body.
  async function openTray(props: Record<string, unknown>) {
    render(Harness, { props });
    await vi.waitFor(() => expect(RED.tray.show).toHaveBeenCalled());
    const trayOptions = vi.mocked(RED.tray.show).mock.calls.at(-1)![0];

    trayEl = document.createElement("div");
    trayEl.innerHTML = '<div class="red-ui-tray-body"></div>';
    document.body.appendChild(trayEl);
    trayOptions.open(window.$(trayEl));

    const body = trayEl.querySelector(".red-ui-tray-body") as HTMLElement;
    await vi.waitFor(() =>
      expect(body.querySelector(".editor-wrapper")).not.toBeNull(),
    );
    return { body, trayOptions };
  }

  test("renders no custom error banner for an invalid schema (Monaco surfaces JSON errors inline)", async () => {
    const { body } = await openTray({
      title: "Schema — Input",
      value: "{ not json",
    });
    // The tray opens for invalid input and delegates error display to Monaco's
    // inline diagnostics — it renders no separate error banner of its own
    // (see json-schema-editor-input-tray.vue).
    expect(body.querySelector(".nrg-schema-tray-error")).toBeNull();
  });

  test("shows no error banner for a valid schema", async () => {
    const { body } = await openTray({ value: '{"type":"object"}' });
    expect(body.querySelector(".nrg-schema-tray-error")).toBeNull();
  });

  test("shows no error banner for an empty (no-override) schema", async () => {
    const { body } = await openTray({ value: "" });
    expect(body.querySelector(".nrg-schema-tray-error")).toBeNull();
  });

  test("Done forwards the current draft to onSave", async () => {
    const onSave = vi.fn();
    const { trayOptions } = await openTray({
      value: '{"type":"object"}',
      onSave,
    });
    const done = trayOptions.buttons.find(
      (b: { id?: string }) => b.id === "node-dialog-ok",
    );
    // The handler ignores its event; call it with none.
    const click: () => void = done.click;
    click();
    expect(onSave).toHaveBeenCalledWith('{"type":"object"}');
  });
});
