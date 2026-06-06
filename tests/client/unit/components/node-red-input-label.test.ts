import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedInputLabel from "../../../src/core/client/form/components/node-red-input-label.vue";

describe("NodeRedInputLabel", () => {
  test("renders label text", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Username" },
    });
    await expect.element(screen.getByText("Username")).toBeInTheDocument();
  });

  test("renders icon with auto fa- prefix", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Name", icon: "tag" },
    });
    const icon = screen.container.querySelector("i.fa.fa-tag");
    expect(icon).not.toBeNull();
  });

  test("does not double-prefix fa-", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Name", icon: "fa-tag" },
    });
    const icon = screen.container.querySelector("i.fa.fa-tag");
    expect(icon).not.toBeNull();
    const badIcon = screen.container.querySelector("i.fa.fa-fa-tag");
    expect(badIcon).toBeNull();
  });

  test("hides icon when not provided", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Name" },
    });
    const icon = screen.container.querySelector("i");
    expect(icon).toBeNull();
  });

  test("shows required asterisk", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Email", required: true },
    });
    await expect.element(screen.getByText("*")).toBeInTheDocument();
  });

  test("hides required asterisk when not required", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Email", required: false },
    });
    const asterisk = screen.container.querySelector(".nrg-required");
    expect(asterisk).toBeNull();
  });

  test("renders slot content instead of label prop", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Ignored" },
      slots: { default: "Custom Label" },
    });
    await expect.element(screen.getByText("Custom Label")).toBeInTheDocument();
  });
});
