import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { defineComponent, h, ref, nextTick } from "vue";
import NodeRedInput from "@/sdk/lib/client/form/components/node-red-input.vue";

describe("NodeRedInput", () => {
  test("renders a text input by default", async () => {
    const screen = render(NodeRedInput);
    const input = screen.getByRole("textbox");
    await expect.element(input).toBeInTheDocument();
  });

  test("renders label when provided", async () => {
    const screen = render(NodeRedInput, {
      props: { label: "Username" },
    });
    await expect.element(screen.getByText("Username")).toBeInTheDocument();
  });

  test("hides label when not provided", async () => {
    const screen = render(NodeRedInput);
    const label = screen.container.querySelector(".nrg-label");
    expect(label).toBeNull();
  });

  test("renders placeholder", async () => {
    const screen = render(NodeRedInput, {
      props: { placeholder: "Enter name..." },
    });
    const input = screen.container.querySelector("input") as HTMLInputElement;
    expect(input?.placeholder).toBe("Enter name...");
  });

  test("displays initial value from modelValue", async () => {
    const screen = render(NodeRedInput, {
      props: { modelValue: "hello" },
    });
    const input = screen.getByRole("textbox");
    await expect.element(input).toHaveValue("hello");
  });

  test("displays initial value from value prop", async () => {
    const screen = render(NodeRedInput, {
      props: { value: "world" },
    });
    const input = screen.getByRole("textbox");
    await expect.element(input).toHaveValue("world");
  });

  test("modelValue takes precedence over value", async () => {
    const screen = render(NodeRedInput, {
      props: { modelValue: "from-model", value: "from-value" },
    });
    const input = screen.getByRole("textbox");
    await expect.element(input).toHaveValue("from-model");
  });

  test("emits update:modelValue on input", async () => {
    const onUpdate = vi.fn();
    const screen = render(NodeRedInput, {
      props: {
        modelValue: "",
        "onUpdate:modelValue": onUpdate,
      },
    });
    const input = screen.getByRole("textbox");
    await input.fill("typed");
    expect(onUpdate).toHaveBeenCalled();
  });

  test("emits update:value on input", async () => {
    const onUpdateValue = vi.fn();
    const screen = render(NodeRedInput, {
      props: {
        value: "",
        "onUpdate:value": onUpdateValue,
      },
    });
    const input = screen.getByRole("textbox");
    await input.fill("typed");
    expect(onUpdateValue).toHaveBeenCalled();
  });

  test("emits input event on input", async () => {
    const onInput = vi.fn();
    const screen = render(NodeRedInput, {
      props: {
        modelValue: "",
        onInput: onInput,
      },
    });
    const input = screen.getByRole("textbox");
    await input.fill("typed");
    expect(onInput).toHaveBeenCalled();
  });

  test("password type masks __PWD__ value on mount", async () => {
    const screen = render(NodeRedInput, {
      props: { value: "__PWD__", type: "password" },
    });
    const input = screen.container.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input!.value).toBe("*************");
  });

  test("password type clears mask on focus", async () => {
    const screen = render(NodeRedInput, {
      props: { value: "__PWD__", type: "password" },
    });
    const input = screen.container.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    input!.focus();
    input!.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => {
      expect(input!.value).toBe("");
    });
  });

  test("shows error message", async () => {
    const screen = render(NodeRedInput, {
      props: { error: "Field is required" },
    });
    await expect
      .element(screen.getByText("Field is required"))
      .toBeInTheDocument();
  });

  test("hides error message when empty", async () => {
    const screen = render(NodeRedInput, {
      props: { error: "" },
    });
    const errorDiv = screen.container.querySelector(
      ".node-red-vue-input-error-message",
    );
    expect(errorDiv).toBeNull();
  });

  test("shows required asterisk in label", async () => {
    const screen = render(NodeRedInput, {
      props: { label: "Email", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("renders label with icon", async () => {
    const screen = render(NodeRedInput, {
      props: { label: "Name", icon: "tag" },
    });
    const icon = screen.container.querySelector("i.fa.fa-tag");
    expect(icon).not.toBeNull();
  });

  // --- 5.3: prop→widget sync + focus guard (each test fails without its half) ---

  test("syncs an EXTERNAL value change into the input (proves the watcher)", async () => {
    // A reactive parent stands in for a custom form driving the field's value.
    const external = ref("old");
    const Parent = defineComponent({
      setup: () => () =>
        h(NodeRedInput, { value: external.value, label: "Name" }),
    });
    const screen = render(Parent);
    const input = screen.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("old");

    // Programmatic (external) change — e.g. picking a Region resets City via
    // useFormNode. WITHOUT the watcher the input keeps showing "old" (the widget
    // is seed-once), so this line is the proof the sync is needed.
    external.value = "new";
    await vi.waitFor(() => expect(input.value).toBe("new"));
  });

  test("does NOT clobber a focused input on an external change (proves the focus guard)", async () => {
    const external = ref("old");
    const Parent = defineComponent({
      setup: () => () =>
        h(NodeRedInput, { value: external.value, label: "Name" }),
    });
    const screen = render(Parent);
    const input = screen.container.querySelector("input") as HTMLInputElement;

    // The user is mid-edit (focused + typed, not yet blurred).
    input.focus();
    input.dispatchEvent(new Event("focus"));
    input.value = "user-typing";
    input.dispatchEvent(new Event("input"));

    // An external change lands WHILE focused. The guard must ignore it so the
    // user's in-progress text (and caret) survive. WITHOUT the focus guard the
    // watcher overwrites it with "external" and this assertion fails.
    external.value = "external";
    await nextTick();
    await nextTick();
    expect(input.value).toBe("user-typing");
  });
});
