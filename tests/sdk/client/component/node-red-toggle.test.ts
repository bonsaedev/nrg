import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedToggle from "@/sdk/lib/client/form/components/lib/inputs/node-red-toggle.vue";

describe("NodeRedToggle", () => {
  test("renders unchecked by default", async () => {
    const screen = render(NodeRedToggle);
    const checkbox = screen.getByRole("checkbox");
    await expect.element(checkbox).not.toBeChecked();
  });

  test("renders checked when modelValue is true", async () => {
    const screen = render(NodeRedToggle, {
      props: { modelValue: true },
    });
    const checkbox = screen.getByRole("checkbox");
    await expect.element(checkbox).toBeChecked();
  });

  test("applies checked class when modelValue is true", async () => {
    const screen = render(NodeRedToggle, {
      props: { modelValue: true },
    });
    const label = screen.container.querySelector(".nrg-toggle");
    expect(label?.classList.contains("nrg-toggle--checked")).toBe(true);
  });

  test("does not apply checked class when unchecked", async () => {
    const screen = render(NodeRedToggle, {
      props: { modelValue: false },
    });
    const label = screen.container.querySelector(".nrg-toggle");
    expect(label?.classList.contains("nrg-toggle--checked")).toBe(false);
  });

  test("emits update:modelValue with true on click when unchecked", async () => {
    const onUpdate = vi.fn();
    const screen = render(NodeRedToggle, {
      props: {
        modelValue: false,
        "onUpdate:modelValue": onUpdate,
      },
    });
    // Checkbox is visually hidden (opacity:0) — click the slider instead
    const slider = screen.container.querySelector(
      ".nrg-toggle__slider",
    ) as HTMLElement;
    slider.click();
    expect(onUpdate).toHaveBeenCalledWith(true);
  });

  test("emits update:modelValue with false on click when checked", async () => {
    const onUpdate = vi.fn();
    const screen = render(NodeRedToggle, {
      props: {
        modelValue: true,
        "onUpdate:modelValue": onUpdate,
      },
    });
    const slider = screen.container.querySelector(
      ".nrg-toggle__slider",
    ) as HTMLElement;
    slider.click();
    expect(onUpdate).toHaveBeenCalledWith(false);
  });

  test("renders label text", async () => {
    const screen = render(NodeRedToggle, {
      props: { label: "Enable" },
    });
    await expect.element(screen.getByText("Enable")).toBeInTheDocument();
  });

  test("renders icon with auto fa- prefix", async () => {
    const screen = render(NodeRedToggle, {
      props: { icon: "check", label: "Active" },
    });
    const icon = screen.container.querySelector("i.fa.fa-check");
    expect(icon).not.toBeNull();
  });

  test("hides label and icon when not provided", async () => {
    const screen = render(NodeRedToggle);
    const labelSpan = screen.container.querySelector(".nrg-toggle__label");
    expect(labelSpan).toBeNull();
  });
});
