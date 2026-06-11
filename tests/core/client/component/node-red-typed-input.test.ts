import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedTypedInput from "@/core/client/form/components/node-red-typed-input.vue";
import { getJQueryState } from "@/test/client/component/jquery";

describe("NodeRedTypedInput", () => {
  const DEFAULT_PROPS = {
    value: { value: "hello", type: "str" },
    types: ["str", "num", "bool"] as any[],
  };

  test("mounts without error", async () => {
    const screen = render(NodeRedTypedInput, {
      props: DEFAULT_PROPS,
    });
    const input = screen.container.querySelector("input.node-red-typed-input");
    expect(input).not.toBeNull();
  });

  test("initializes typedInput with value and type", async () => {
    const screen = render(NodeRedTypedInput, {
      props: DEFAULT_PROPS,
    });
    const input = screen.container.querySelector(
      "input.node-red-typed-input",
    ) as HTMLInputElement;
    const state = getJQueryState(input as Element);
    expect(state.typedInput.value).toBe("hello");
    expect(state.typedInput.type).toBe("str");
  });

  test("renders label when provided", async () => {
    const screen = render(NodeRedTypedInput, {
      props: { ...DEFAULT_PROPS, label: "Target" },
    });
    await expect.element(screen.getByText("Target")).toBeInTheDocument();
  });

  test("renders icon in label", async () => {
    const screen = render(NodeRedTypedInput, {
      props: { ...DEFAULT_PROPS, label: "Target", icon: "crosshairs" },
    });
    const icon = screen.container.querySelector("i.fa.fa-crosshairs");
    expect(icon).not.toBeNull();
  });

  test("shows error message", async () => {
    const screen = render(NodeRedTypedInput, {
      props: { ...DEFAULT_PROPS, error: "Invalid value" },
    });
    await expect.element(screen.getByText("Invalid value")).toBeInTheDocument();
  });

  test("shows required asterisk", async () => {
    const screen = render(NodeRedTypedInput, {
      props: { ...DEFAULT_PROPS, label: "Value", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("modelValue takes precedence over value", async () => {
    const screen = render(NodeRedTypedInput, {
      props: {
        modelValue: { value: "from-model", type: "num" },
        value: { value: "from-value", type: "str" },
        types: ["str", "num"] as any[],
      },
    });
    const input = screen.container.querySelector(
      "input.node-red-typed-input",
    ) as HTMLInputElement;
    const state = getJQueryState(input as Element);
    expect(state.typedInput.value).toBe("from-model");
    expect(state.typedInput.type).toBe("num");
  });

  test("emits update events on change", async () => {
    const onModelUpdate = vi.fn();
    const onValueUpdate = vi.fn();
    const screen = render(NodeRedTypedInput, {
      props: {
        ...DEFAULT_PROPS,
        "onUpdate:modelValue": onModelUpdate,
        "onUpdate:value": onValueUpdate,
      },
    });
    const input = screen.container.querySelector(
      "input.node-red-typed-input",
    ) as HTMLInputElement;
    const jqState = getJQueryState(input as Element);
    jqState.typedInput.value = "42";
    jqState.typedInput.type = "num";
    jqState.listeners["change"]?.forEach((cb: Function) => cb());
    expect(onModelUpdate).toHaveBeenCalledWith({ value: "42", type: "num" });
    expect(onValueUpdate).toHaveBeenCalledWith({ value: "42", type: "num" });
  });

  test("does not emit when value unchanged", async () => {
    const onModelUpdate = vi.fn();
    const screen = render(NodeRedTypedInput, {
      props: {
        ...DEFAULT_PROPS,
        "onUpdate:modelValue": onModelUpdate,
      },
    });
    const input = screen.container.querySelector(
      "input.node-red-typed-input",
    ) as HTMLInputElement;
    const jqState = getJQueryState(input as Element);
    // Value unchanged from initial
    jqState.listeners["change"]?.forEach((cb: Function) => cb());
    expect(onModelUpdate).not.toHaveBeenCalled();
  });

  test("uses default types when none provided", async () => {
    const screen = render(NodeRedTypedInput, {
      props: {
        value: { value: "test", type: "msg" },
      },
    });
    const input = screen.container.querySelector("input.node-red-typed-input");
    expect(input).not.toBeNull();
  });
});

describe("NodeRedTypedInput edge paths", () => {
  test("warns when the provided type is not in the allowed types", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(NodeRedTypedInput, {
      props: { value: { value: "", type: "bogus" }, types: ["str", "num"] },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Validation failed: type (bogus)"),
    );
    warn.mockRestore();
  });

  test("error prop toggles the input-error class on the widget container", async () => {
    const screen = render(NodeRedTypedInput, {
      props: { value: { value: "", type: "str" }, error: "" },
    });
    // the real jQuery widget renders this container; the mock doesn't,
    // so provide one for the watcher to decorate
    const fake = document.createElement("div");
    fake.className = "red-ui-typedInput-container";
    screen.container.firstElementChild!.appendChild(fake);

    await screen.rerender({ error: "boom" });
    await vi.waitFor(() => {
      expect(fake.classList.contains("input-error")).toBe(true);
    });

    await screen.rerender({ error: "" });
    await vi.waitFor(() => {
      expect(fake.classList.contains("input-error")).toBe(false);
    });
  });

  test("value-attribute mutations emit updates (plain text typing path)", async () => {
    const onUpdate = vi.fn();
    const screen = render(NodeRedTypedInput, {
      props: {
        value: { value: "old", type: "str" },
        "onUpdate:value": onUpdate,
      },
    });
    const input = screen.container.querySelector(
      "input.node-red-typed-input",
    ) as HTMLInputElement;
    // let the mounted() $nextTick attach the MutationObserver
    await new Promise((resolve) => setTimeout(resolve, 0));

    // typedInput("value", ...) writes the value attribute, which is exactly
    // what the real widget does while the user types into a plain text input
    window.$(input).typedInput("value", "typed-text");

    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        value: "typed-text",
        type: "str",
      });
    });
  });
});
