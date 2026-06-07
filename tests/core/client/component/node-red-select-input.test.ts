import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedSelectInput from "@/core/client/form/components/node-red-select-input.vue";
import { getJQueryState } from "@/test/client/component/jquery";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("NodeRedSelectInput", () => {
  test("mounts without error", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS },
    });
    const input = screen.container.querySelector("input.node-input-select");
    expect(input).not.toBeNull();
  });

  test("initializes typedInput with options", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS },
    });
    const input = screen.container.querySelector(
      "input.node-input-select",
    ) as HTMLInputElement;
    const state = getJQueryState(input as Element);
    expect(state).toBeDefined();
    expect(state.typedInput).toBeDefined();
  });

  test("renders label when provided", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, label: "Choose" },
    });
    await expect.element(screen.getByText("Choose")).toBeInTheDocument();
  });

  test("renders with icon in label", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, label: "Status", icon: "flag" },
    });
    const icon = screen.container.querySelector("i.fa.fa-flag");
    expect(icon).not.toBeNull();
  });

  test("shows error message", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, error: "Select a value" },
    });
    await expect
      .element(screen.getByText("Select a value"))
      .toBeInTheDocument();
  });

  test("hides error when empty", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, error: "" },
    });
    const errorDiv = screen.container.querySelector(
      ".node-red-vue-input-error-message",
    );
    expect(errorDiv).toBeNull();
  });

  test("shows required asterisk", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, label: "Priority", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("sets initial value from modelValue", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, modelValue: "b" },
    });
    const input = screen.container.querySelector(
      "input.node-input-select",
    ) as HTMLInputElement;
    const state = getJQueryState(input as Element);
    expect(state.typedInput.value).toBe("b");
  });

  test("sets initial value from value prop", async () => {
    const screen = render(NodeRedSelectInput, {
      props: { options: OPTIONS, value: "c" },
    });
    const input = screen.container.querySelector(
      "input.node-input-select",
    ) as HTMLInputElement;
    const state = getJQueryState(input as Element);
    expect(state.typedInput.value).toBe("c");
  });

  test("emits events on change (single select)", async () => {
    const onModelUpdate = vi.fn();
    const onValueUpdate = vi.fn();
    const screen = render(NodeRedSelectInput, {
      props: {
        options: OPTIONS,
        value: "a",
        "onUpdate:modelValue": onModelUpdate,
        "onUpdate:value": onValueUpdate,
      },
    });
    const input = screen.container.querySelector(
      "input.node-input-select",
    ) as HTMLInputElement;
    const jqState = getJQueryState(input as Element);
    jqState.typedInput.value = "b";
    jqState.listeners["change"]?.forEach((cb: Function) => cb());
    expect(onModelUpdate).toHaveBeenCalledWith("b");
    expect(onValueUpdate).toHaveBeenCalledWith("b");
  });

  test("emits array on change (multi select)", async () => {
    const onModelUpdate = vi.fn();
    const screen = render(NodeRedSelectInput, {
      props: {
        options: OPTIONS,
        multiple: true,
        value: [],
        "onUpdate:modelValue": onModelUpdate,
      },
    });
    const input = screen.container.querySelector(
      "input.node-input-select",
    ) as HTMLInputElement;
    const jqState = getJQueryState(input as Element);
    jqState.typedInput.value = "a,c";
    jqState.listeners["change"]?.forEach((cb: Function) => cb());
    expect(onModelUpdate).toHaveBeenCalledWith(["a", "c"]);
  });
});
