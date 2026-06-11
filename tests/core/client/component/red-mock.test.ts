import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-vue";
import { defineComponent, h, ref, onMounted } from "vue";
import { createNode } from "@/test/client/component";

describe("RED.settings", () => {
  test("supports get/set/remove and direct property access", () => {
    const { RED } = createNode({});

    RED.settings.set("editor-language", "de");
    expect(RED.settings.get("editor-language")).toBe("de");
    expect(RED.settings["editor-language"]).toBe("de");

    // exportable settings arrive as direct properties — get() must see them
    RED.settings.myNodesApiUrl = "https://api.example.com";
    expect(RED.settings.get("myNodesApiUrl")).toBe("https://api.example.com");

    expect(RED.settings.remove("editor-language")).toBe("de");
    expect(RED.settings.get("editor-language")).toBeUndefined();
  });

  test("is reset between tests (1/2: write)", () => {
    const { RED } = createNode({});
    RED.settings.set("leak-probe", true);
    expect(RED.settings.get("leak-probe")).toBe(true);
  });

  test("is reset between tests (2/2: read)", () => {
    const { RED } = createNode({});
    expect(RED.settings.get("leak-probe")).toBeUndefined();
  });
});

describe("RED.events", () => {
  test("emit dispatches to registered listeners with arguments", () => {
    const { RED } = createNode({});
    const listener = vi.fn();

    RED.events.on("nodes:change", listener);
    RED.events.emit("nodes:change", { id: "n1" }, "extra");

    expect(listener).toHaveBeenCalledWith({ id: "n1" }, "extra");
  });

  test("off removes a specific listener", () => {
    const { RED } = createNode({});
    const kept = vi.fn();
    const removed = vi.fn();

    RED.events.on("deploy", kept);
    RED.events.on("deploy", removed);
    RED.events.off("deploy", removed);
    RED.events.emit("deploy");

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  test("drives a component subscribed to editor events", async () => {
    const Probe = defineComponent({
      setup() {
        const deploys = ref(0);
        onMounted(() => {
          window.RED.events.on("deploy", () => deploys.value++);
        });
        return () => h("span", { class: "deploys" }, String(deploys.value));
      },
    });
    const { RED, provide } = createNode({});
    const component = render(Probe, { global: { provide } });

    RED.events.emit("deploy");

    await vi.waitFor(() => {
      expect(component.container.querySelector(".deploys")!.textContent).toBe(
        "1",
      );
    });
  });
});

describe("RED.comms", () => {
  test("publish delivers to exact-topic subscribers", () => {
    const { RED } = createNode({});
    const cb = vi.fn();

    RED.comms.subscribe("status/node-1", cb);
    RED.comms.publish("status/node-1", { text: "running" });

    expect(cb).toHaveBeenCalledWith("status/node-1", { text: "running" });
  });

  test("supports + and # wildcards", () => {
    const { RED } = createNode({});
    const plus = vi.fn();
    const hash = vi.fn();
    const miss = vi.fn();

    RED.comms.subscribe("status/+", plus);
    RED.comms.subscribe("notification/#", hash);
    RED.comms.subscribe("other/topic", miss);

    RED.comms.publish("status/node-1", "a");
    RED.comms.publish("notification/runtime/deploy", "b");

    expect(plus).toHaveBeenCalledWith("status/node-1", "a");
    expect(hash).toHaveBeenCalledWith("notification/runtime/deploy", "b");
    expect(miss).not.toHaveBeenCalled();
  });

  test("unsubscribe stops delivery", () => {
    const { RED } = createNode({});
    const cb = vi.fn();

    RED.comms.subscribe("status/node-1", cb);
    RED.comms.unsubscribe("status/node-1", cb);
    RED.comms.publish("status/node-1", {});

    expect(cb).not.toHaveBeenCalled();
  });

  test("drives a component showing live runtime state", async () => {
    const Probe = defineComponent({
      setup() {
        const status = ref("idle");
        onMounted(() => {
          window.RED.comms.subscribe("nrg/deploy/#", (_topic, msg) => {
            status.value = String(msg.state);
          });
        });
        return () => h("span", { class: "deploy-status" }, status.value);
      },
    });
    const { RED, provide } = createNode({});
    const component = render(Probe, { global: { provide } });

    RED.comms.publish("nrg/deploy/job-1", { state: "deploying" });

    await vi.waitFor(() => {
      expect(
        component.container.querySelector(".deploy-status")!.textContent,
      ).toBe("deploying");
    });
  });
});

describe("RED.notify", () => {
  test("returns a handle with update and close", () => {
    const { RED } = createNode({});

    const notification = RED.notify("Deploying...", { type: "compact" });
    expect(RED.notify).toHaveBeenCalledWith("Deploying...", {
      type: "compact",
    });

    // a component holding the handle must be able to drive it
    notification.update("Deployed", { timeout: 2000 });
    notification.close();
  });
});

describe("RED.popover", () => {
  test("create returns a chainable popover instance", () => {
    const { RED } = createNode({});

    const popover = RED.popover.create({ target: window.$("<div/>") });
    expect(popover.open().setContent("hi").close()).toBe(popover);
    expect(RED.popover.create).toHaveBeenCalled();
  });

  test("tooltip returns a full tooltip instance", () => {
    const { RED } = createNode({});

    const tooltip = RED.popover.tooltip(window.$("<div/>"), "tip");
    tooltip.setAction("copy");
    expect(tooltip.open().close()).toBe(tooltip);
    tooltip.delete();
  });
});

describe("RED.nodes registry", () => {
  test("createNode fakes are visible to node/eachConfig/filterNodes/getType", () => {
    const { RED } = createNode({
      nodes: [
        { id: "cfg-1", type: "my-config", name: "First" },
        { id: "cfg-2", type: "my-config", name: "Second" },
        { id: "other", type: "other-config", name: "Other" },
      ],
    });

    expect(RED.nodes.node("cfg-1")).toMatchObject({ name: "First" });
    expect(RED.nodes.node("missing")).toBeNull();

    const seen: string[] = [];
    RED.nodes.eachConfig((n) => {
      seen.push(n.id);
    });
    expect(seen).toEqual(["cfg-1", "cfg-2", "other"]);

    expect(RED.nodes.filterNodes({ type: "my-config" })).toHaveLength(2);

    RED.nodes.registerType("my-config", { category: "config" });
    expect(RED.nodes.getType("my-config")).toEqual({ category: "config" });
    expect(RED.nodes.getType("unknown")).toBeNull();
  });

  test("eachNode stops iterating when the callback returns false", () => {
    const { RED } = createNode({
      nodes: [
        { id: "a", type: "t" },
        { id: "b", type: "t" },
      ],
    });

    const seen: string[] = [];
    RED.nodes.eachNode((n) => {
      seen.push(n.id);
      return false;
    });
    expect(seen).toEqual(["a"]);
  });

  test("add/remove/id manage the registry", () => {
    const { RED } = createNode({});

    const id = RED.nodes.id();
    expect(RED.nodes.id()).not.toBe(id);

    RED.nodes.add({ id, type: "dyn" });
    expect(RED.nodes.node(id)).toMatchObject({ type: "dyn" });

    const removed = RED.nodes.remove(id);
    expect(removed.nodes).toHaveLength(1);
    expect(RED.nodes.node(id)).toBeNull();
  });

  test("filterLinks matches registered links", () => {
    const { RED } = createNode({});
    const source = { id: "n1", type: "t" };
    const target = { id: "n2", type: "t" };
    RED.nodes.addLink({ source, target, sourcePort: 0 });

    expect(RED.nodes.filterLinks({ source })).toHaveLength(1);
    expect(RED.nodes.filterLinks({ target: { id: "n2" } })).toHaveLength(1);
    expect(RED.nodes.filterLinks({ source: { id: "nope" } })).toHaveLength(0);
  });

  test("dirty is a getter/setter", () => {
    const { RED } = createNode({});
    expect(RED.nodes.dirty()).toBe(false);
    RED.nodes.dirty(true);
    expect(RED.nodes.dirty()).toBe(true);
  });
});

describe("RED.editor mock editor", () => {
  test("setValue fires session change listeners", () => {
    const { RED } = createNode({});

    const editor = RED.editor.createEditor({ id: "ed", value: "initial" });
    const onChange = vi.fn();
    editor.getSession().on("change", onChange);

    editor.setValue("updated");

    expect(editor.getValue()).toBe("updated");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("instances created by components are reachable via the spy", () => {
    const { RED } = createNode({});
    vi.mocked(RED.editor.createEditor).mockClear();

    RED.editor.createEditor({ id: "ed", value: "from-component" });

    const instance = vi.mocked(RED.editor.createEditor).mock.results[0]
      .value as ReturnType<typeof RED.editor.createEditor>;
    expect(instance.getValue()).toBe("from-component");
  });
});

describe("jQuery mock DOM surface", () => {
  test("creates elements from html strings with attributes", () => {
    const jq = window.$("<div/>", {
      id: "made",
      class: "x",
      html: "<b>hi</b>",
    });
    const el = jq[0] as HTMLElement;
    expect(el.id).toBe("made");
    expect(el.innerHTML).toBe("<b>hi</b>");
  });

  test("wraps elements, selectors, node-like objects and null", () => {
    const div = document.createElement("div");
    div.id = "lookup-target";
    document.body.appendChild(div);
    expect(window.$("#lookup-target")[0]).toBe(div);
    expect(window.$(div)[0]).toBe(div);
    expect(window.$(null)[0]).toBeNull();
    expect(window.$(null).length).toBe(0);
    div.remove();
  });

  test("supports the DOM manipulation chain components rely on", () => {
    const parent = window.$("<div/>");
    const child = window.$("<span/>", { class: "kid" });
    child.appendTo(parent);
    expect((parent[0] as Element).querySelector(".kid")).toBeTruthy();

    parent.append(window.$("<i/>", { class: "extra" }));
    expect((parent[0] as Element).querySelector(".extra")).toBeTruthy();

    expect(parent.find(".kid")[0]).toBeTruthy();
    expect(parent.find(".missing")[0]).toBeNull();

    parent.html("<u>replaced</u>");
    expect((parent[0] as Element).innerHTML).toBe("<u>replaced</u>");
    parent.empty();
    expect((parent[0] as Element).innerHTML).toBe("");

    parent.addClass("on").i18n();
    expect((parent[0] as Element).classList.contains("on")).toBe(true);
    parent.removeClass("on");
    expect((parent[0] as Element).classList.contains("on")).toBe(false);
  });

  test("val reads and writes form elements only", () => {
    const input = document.createElement("input");
    const jq = window.$(input);
    jq.val("typed");
    expect(jq.val()).toBe("typed");
    expect(window.$("<div/>").val()).toBe("");
  });

  test("on/off/__trigger manage listener state", () => {
    const el = document.createElement("input");
    const jq = window.$(el);
    const cb = vi.fn();

    jq.on("change", cb);
    jq.__trigger("change");
    expect(cb).toHaveBeenCalledTimes(1);

    jq.off("change");
    jq.__trigger("change");
    expect(cb).toHaveBeenCalledTimes(1);

    jq.on("a", cb).on("b", cb);
    jq.off();
    jq.__trigger("a");
    jq.__trigger("b");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("jQuery typedInput mock", () => {
  test("supports the full widget action surface", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const jq = window.$(input);

    jq.typedInput({ default: "msg", types: ["msg", "str"] });
    expect(jq.typedInput("type")).toBe("msg");

    jq.typedInput("value", "payload");
    expect(jq.typedInput("value")).toBe("payload");

    expect(jq.typedInput("validate")).toBe(true);

    // must not throw — components call these during lifecycle
    jq.typedInput("types", ["str", "num"]);
    jq.typedInput("disable");
    jq.typedInput("enable");
    jq.typedInput("hide");
    jq.typedInput("show");
    jq.typedInput("width", "100%");
    jq.typedInput("focus");

    input.remove();
  });
});
