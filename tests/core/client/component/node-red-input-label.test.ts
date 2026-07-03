import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-vue";
import NodeRedInputLabel from "@/sdk/lib/client/form/components/node-red-input-label.vue";

describe("NodeRedInputLabel", () => {
  test("renders label text", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Username" },
    });
    await expect.element(screen.getByText("Username")).toBeInTheDocument();
  });

  test("renders a plain <span> by default (no htmlFor)", async () => {
    const screen = render(NodeRedInputLabel, { props: { label: "Name" } });
    expect(screen.container.querySelector("span.nrg-label")).not.toBeNull();
    expect(screen.container.querySelector("label.nrg-label")).toBeNull();
  });

  test("renders a real <label for> when htmlFor is set (a11y)", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Name", htmlFor: "nrg-n1-name" },
    });
    const label = screen.container.querySelector("label.nrg-label");
    expect(label).not.toBeNull();
    expect(label!.getAttribute("for")).toBe("nrg-n1-name");
  });

  test("exposes an id via labelId (aria-labelledby target)", async () => {
    const screen = render(NodeRedInputLabel, {
      props: { label: "Name", labelId: "nrg-n1-name-label" },
    });
    expect(
      screen.container.querySelector(".nrg-label")!.getAttribute("id"),
    ).toBe("nrg-n1-name-label");
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
