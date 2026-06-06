import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedConfigInput from "../../../../../src/core/client/form/components/node-red-config-input.vue";
import { createNode, getMockRED } from "../../../../../src/test/client/unit";
import { getJQueryState } from "../../../../../src/test/client/unit/jquery";

describe("NodeRedConfigInput", () => {
  const DEFAULT_PROPS = {
    type: "my-config",
    node: createNode(),
    propName: "server",
    value: "config-1",
  };

  test("mounts without error", async () => {
    const screen = render(NodeRedConfigInput, {
      props: DEFAULT_PROPS,
    });
    const input = screen.container.querySelector("#node-input-server");
    expect(input).not.toBeNull();
  });

  test("creates input with correct id", async () => {
    const screen = render(NodeRedConfigInput, {
      props: { ...DEFAULT_PROPS, propName: "database" },
    });
    const input = screen.container.querySelector("#node-input-database");
    expect(input).not.toBeNull();
  });

  test("calls RED.editor.prepareConfigNodeSelect", async () => {
    const spy = vi.spyOn(
      getMockRED().editor,
      "prepareConfigNodeSelect",
    );
    render(NodeRedConfigInput, { props: DEFAULT_PROPS });
    expect(spy).toHaveBeenCalledWith(
      DEFAULT_PROPS.node,
      "server",
      "my-config",
      "node-input",
    );
    spy.mockRestore();
  });

  test("renders label when provided", async () => {
    const screen = render(NodeRedConfigInput, {
      props: { ...DEFAULT_PROPS, label: "Server" },
    });
    await expect.element(screen.getByText("Server")).toBeInTheDocument();
  });

  test("renders icon in label", async () => {
    const screen = render(NodeRedConfigInput, {
      props: { ...DEFAULT_PROPS, label: "Server", icon: "server" },
    });
    const icon = screen.container.querySelector("i.fa.fa-server");
    expect(icon).not.toBeNull();
  });

  test("shows error message", async () => {
    const screen = render(NodeRedConfigInput, {
      props: { ...DEFAULT_PROPS, error: "Config required" },
    });
    await expect
      .element(screen.getByText("Config required"))
      .toBeInTheDocument();
  });

  test("shows required asterisk", async () => {
    const screen = render(NodeRedConfigInput, {
      props: { ...DEFAULT_PROPS, label: "Config", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("emits empty string when value is _ADD_", async () => {
    const onModelUpdate = vi.fn();
    const onValueUpdate = vi.fn();
    const screen = render(NodeRedConfigInput, {
      props: {
        ...DEFAULT_PROPS,
        "onUpdate:modelValue": onModelUpdate,
        "onUpdate:value": onValueUpdate,
      },
    });
    const input = screen.container.querySelector(
      "#node-input-server",
    ) as HTMLInputElement;
    input.value = "_ADD_";
    const jqState = getJQueryState(input as Element);
    jqState?.listeners["change"]?.forEach((cb: Function) => cb());
    expect(onModelUpdate).toHaveBeenCalledWith("");
    expect(onValueUpdate).toHaveBeenCalledWith("");
  });

  test("emits actual value on change", async () => {
    const onModelUpdate = vi.fn();
    const screen = render(NodeRedConfigInput, {
      props: {
        ...DEFAULT_PROPS,
        "onUpdate:modelValue": onModelUpdate,
      },
    });
    const input = screen.container.querySelector(
      "#node-input-server",
    ) as HTMLInputElement;
    input.value = "config-2";
    const jqState = getJQueryState(input as Element);
    jqState?.listeners["change"]?.forEach((cb: Function) => cb());
    expect(onModelUpdate).toHaveBeenCalledWith("config-2");
  });

  test("modelValue takes precedence over value", async () => {
    const screen = render(NodeRedConfigInput, {
      props: {
        ...DEFAULT_PROPS,
        modelValue: "from-model",
        value: "from-value",
      },
    });
    const input = screen.container.querySelector(
      "#node-input-server",
    ) as HTMLInputElement;
    expect(input.value).toBe("from-model");
  });
});
