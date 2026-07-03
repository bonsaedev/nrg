import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/sdk/lib/client/form", () => ({
  mountApp: vi.fn(),
  unmountApp: vi.fn(),
}));

import {
  defineNode,
  registerType,
  registerTypes,
} from "@/sdk/lib/client/registration";
import type { RuntimeNodeDefinition } from "@/sdk/lib/client/types";
import { mountApp, unmountApp } from "@/sdk/lib/client/form";

const RED = window.RED;

function spyOnRegisterType() {
  return vi.spyOn(RED.nodes, "registerType");
}

// The vite build bakes each node's server-extracted schema (defaults,
// configSchema, outputPortNames, …) onto its definition before registerType
// ever runs — so these tests pass an already-merged RuntimeNodeDefinition.
// registerType's public param is the author-facing NodeDefinition; this typed
// forwarder lets the tests supply the runtime fields without casts.
function register(def: RuntimeNodeDefinition) {
  return registerType(def);
}

const MINIMAL_DEFINITION = {
  type: "test-node",
  category: "function",
  color: "#C0DEED",
};

describe("defineNode", () => {
  it("returns the input unchanged", () => {
    const def = { type: "my-node", category: "function" };
    expect(defineNode(def)).toBe(def);
  });
});

describe("registerType", () => {
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = spyOnRegisterType();
    vi.clearAllMocks();
  });

  it("calls RED.nodes.registerType with the correct type", async () => {
    await register(MINIMAL_DEFINITION);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe("test-node");
  });

  it("passes category and color", async () => {
    await register(MINIMAL_DEFINITION);

    const registered = spy.mock.calls[0][1];
    expect(registered.category).toBe("function");
    expect(registered.color).toBe("#C0DEED");
  });

  it("defaults color to white when not provided", async () => {
    await register({ type: "no-color", category: "function" });

    const registered = spy.mock.calls[0][1];
    expect(registered.color).toBe("#FFFFFF");
  });

  it("defaults inputs and outputs to 0", async () => {
    await register(MINIMAL_DEFINITION);

    const registered = spy.mock.calls[0][1];
    expect(registered.inputs).toBe(0);
    expect(registered.outputs).toBe(0);
  });

  it("passes custom inputs and outputs", async () => {
    await register({
      ...MINIMAL_DEFINITION,
      inputs: 1,
      outputs: 2,
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.inputs).toBe(1);
    expect(registered.outputs).toBe(2);
  });

  it("passes icon", async () => {
    await register({ ...MINIMAL_DEFINITION, icon: "cog" });

    const registered = spy.mock.calls[0][1];
    expect(registered.icon).toBe("cog");
  });

  it("passes align defaulting to left", async () => {
    await register(MINIMAL_DEFINITION);

    const registered = spy.mock.calls[0][1];
    expect(registered.align).toBe("left");
  });

  it("registers defaults carried on the definition", async () => {
    await register({
      type: "schema-node",
      category: "function",
      defaults: {
        name: { value: "" },
        count: { value: 0 },
      },
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.defaults).toEqual({
      name: { value: "" },
      count: { value: 0 },
    });
  });

  it("attaches validate function to first default when configSchema exists", async () => {
    await register({
      type: "validated-node",
      category: "function",
      defaults: {
        name: { value: "" },
        count: { value: 0 },
      },
      configSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "number" },
        },
      },
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.defaults.name.validate).toBeTypeOf("function");
    expect(registered.defaults.name.required).toBeUndefined();
    expect(registered.defaults.count.validate).toBeUndefined();
  });

  it("merges credentialsSchema into configSchema for validation", async () => {
    await register({
      type: "cred-node",
      category: "function",
      defaults: { name: { value: "" } },
      configSchema: {
        type: "object",
        properties: { name: { type: "string" } },
      },
      credentialsSchema: {
        type: "object",
        properties: { apiKey: { type: "string", format: "password" } },
      },
    });

    const registered = spy.mock.calls[0][1];
    const validateFn = registered.defaults.name.validate;
    expect(validateFn).toBeTypeOf("function");
  });

  it("converts button onClick to onclick", async () => {
    const onClick = vi.fn();
    await register({
      ...MINIMAL_DEFINITION,
      type: "button-node",
      button: { toggle: "active", onClick },
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.button.onclick).toBe(onClick);
    expect(registered.button.toggle).toBe("active");
  });

  it("passes lifecycle callbacks", async () => {
    const onEditResize = vi.fn();
    const onPaletteAdd = vi.fn();
    const onPaletteRemove = vi.fn();

    await register({
      ...MINIMAL_DEFINITION,
      type: "lifecycle-node",
      onEditResize,
      onPaletteAdd,
      onPaletteRemove,
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.oneditresize).toBe(onEditResize);
    expect(registered.onpaletteadd).toBe(onPaletteAdd);
    expect(registered.onpaletteremove).toBe(onPaletteRemove);
  });

  it("sets up oneditprepare, oneditsave, oneditcancel, oneditdelete", async () => {
    await register(MINIMAL_DEFINITION);

    const registered = spy.mock.calls[0][1];
    expect(registered.oneditprepare).toBeTypeOf("function");
    expect(registered.oneditsave).toBeTypeOf("function");
    expect(registered.oneditcancel).toBeTypeOf("function");
    expect(registered.oneditdelete).toBeTypeOf("function");
  });

  it("uses custom label when provided", async () => {
    const labelFn = function () {
      return "Custom";
    };
    await register({ ...MINIMAL_DEFINITION, label: labelFn });

    const registered = spy.mock.calls[0][1];
    expect(registered.label).toBe(labelFn);
  });

  it("uses custom outputLabels when provided", async () => {
    const outputLabelsFn = function () {
      return "Custom";
    };
    await register({
      ...MINIMAL_DEFINITION,
      type: "custom-outlabel-node",
      outputLabels: outputLabelsFn,
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.outputLabels).toBe(outputLabelsFn);
  });

  it("labels output ports from server-resolved outputPortNames", async () => {
    await register({
      type: "record-output-node",
      category: "function",
      outputPortNames: ["success", "failure"],
    });

    const registered = spy.mock.calls[0][1];
    const node = { _: (k: string) => k };
    expect(registered.outputLabels.call(node, 0)).toBe("success");
    expect(registered.outputLabels.call(node, 1)).toBe("failure");
  });

  it("throws and logs on error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    spy.mockImplementationOnce(() => {
      throw new Error("registration failed");
    });

    await expect(
      registerType({ ...MINIMAL_DEFINITION, type: "fail-node" }),
    ).rejects.toThrow("registration failed");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("registerType — builtin ports", () => {
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = spyOnRegisterType();
    vi.clearAllMocks();
  });

  it("increments outputs for enabled builtin ports", async () => {
    await register({
      type: "ports-node",
      category: "function",
      defaults: {
        name: { value: "" },
        errorPort: { value: true },
        completePort: { value: false },
        statusPort: { value: true },
      },
      outputs: 1,
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.defaults.outputs.value).toBe(3);
  });

  it("does not add outputs entry when no builtin ports exist", async () => {
    await register({
      type: "no-ports-node",
      category: "function",
      defaults: {
        name: { value: "" },
      },
    });

    const registered = spy.mock.calls[0][1];
    expect(registered.defaults.outputs).toBeUndefined();
  });

  it("labels builtin ports by name", async () => {
    await register({
      type: "labeled-ports-node",
      category: "function",
      defaults: {
        name: { value: "" },
        errorPort: { value: true },
        completePort: { value: true },
        statusPort: { value: true },
      },
      outputs: 1,
    });

    const registered = spy.mock.calls[0][1];
    const node = {
      errorPort: true,
      completePort: true,
      statusPort: true,
      _: (k: string) => k,
    };
    expect(registered.outputLabels.call(node, 1)).toBe("Error");
    expect(registered.outputLabels.call(node, 2)).toBe("Complete");
    expect(registered.outputLabels.call(node, 3)).toBe("Status");
  });
});

describe("registerType — output ports (context modes)", () => {
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = spyOnRegisterType();
    vi.clearAllMocks();
  });

  // oneditprepare builds `features` (incl. outputPorts) and hands it to
  // mountApp (mocked) as its 4th argument. `this` must carry an i18n `_` (a
  // real Node-RED node does) since output-port labels fall back to the node's
  // catalog; the default stub returns the key unchanged (no translation).
  function featuresFor(
    registered: any,
    node: { _: (k: string) => string } = { _: (k) => k },
  ) {
    registered.oneditprepare.call(node);
    return vi.mocked(mountApp).mock.calls[0][3] as {
      outputPorts: { index: number; label: string }[];
    };
  }

  it("labels base output ports from server-resolved outputPortNames", async () => {
    await register({
      type: "ctx-named-node",
      category: "function",
      outputPortNames: ["success", "failure"],
      outputs: 2,
    });

    expect(featuresFor(spy.mock.calls[0][1]).outputPorts).toEqual([
      { index: 0, label: "success" },
      { index: 1, label: "failure" },
    ]);
  });

  it("labels positional ports Output N when unnamed", async () => {
    await register({
      type: "ctx-array-node",
      category: "function",
      outputsSchema: [{}, {}],
      outputs: 2,
    });

    expect(featuresFor(spy.mock.calls[0][1]).outputPorts).toEqual([
      { index: 0, label: "Output 0" },
      { index: 1, label: "Output 1" },
    ]);
  });

  it("labels an unnamed port from the node's i18n outputLabels catalog", async () => {
    // A single/positional output schema yields no `outputPortNames`, but the
    // node may still define `<type>.outputLabels` in its locale (as the canvas
    // hover label already honors). The form table must resolve the same entry
    // instead of falling back to `Output {index}`.
    await register({
      type: "ctx-i18n-node",
      category: "function",
      outputs: 1,
    });

    const node = {
      _: (k: string) => (k === "ctx-i18n-node.outputLabels.0" ? "Result" : k),
    };
    expect(featuresFor(spy.mock.calls[0][1], node).outputPorts).toEqual([
      { index: 0, label: "Result" },
    ]);
  });

  it("yields no output ports when the node has no outputs", async () => {
    await register({
      type: "ctx-none-node",
      category: "function",
      defaults: { name: { value: "" } },
    });

    expect(featuresFor(spy.mock.calls[0][1]).outputPorts).toEqual([]);
  });
});

describe("registerType — oneditsave", () => {
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = spyOnRegisterType();
    vi.clearAllMocks();
  });

  it("unmounts and returns false when state is unchanged", async () => {
    await register({
      type: "save-nochange-node",
      category: "function",
      defaults: { name: { value: "" }, count: { value: 0 } },
    });

    const registered = spy.mock.calls[0][1];
    const def = { defaults: registered.defaults };
    const node: any = {
      _def: def,
      name: "same",
      count: 5,
      credentials: {},
      _newState: { _def: def, name: "same", count: 5, credentials: {} },
    };

    const result = registered.oneditsave.call(node);
    expect(vi.mocked(unmountApp)).toHaveBeenCalledWith(node);
    expect(result).toBe(false);
  });

  it("applies state and returns changes when values differ", async () => {
    await register({
      type: "save-changed-node",
      category: "function",
      defaults: { name: { value: "" }, count: { value: 0 } },
    });

    const registered = spy.mock.calls[0][1];
    const def = { defaults: registered.defaults };
    const node: any = {
      id: "n1",
      _def: def,
      name: "old",
      count: 1,
      credentials: {},
      _newState: { _def: def, name: "new", count: 2, credentials: {} },
    };

    const result = registered.oneditsave.call(node);
    expect(node.name).toBe("new");
    expect(node.count).toBe(2);
    expect(result.changed).toBe(true);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].t).toBe("edit");
    expect(result.history[0].node).toBe(node);
    expect(result.history[0].changes).toEqual({ name: "old", count: 1 });
    expect(result.history[0].links).toEqual([]);
    expect(result.history[0].dirty).toBe(false);
  });

  it("detects credential changes", async () => {
    await register({
      type: "save-cred-node",
      category: "function",
      defaults: { name: { value: "" } },
      credentials: {
        apiKey: { type: "password" },
        username: { type: "text" },
      },
    });

    const registered = spy.mock.calls[0][1];
    const def = {
      defaults: registered.defaults,
      credentials: registered.credentials,
    };
    const node: any = {
      id: "n1",
      _def: def,
      name: "test",
      credentials: {
        apiKey: "old-key",
        has_apiKey: true,
        username: "old-user",
      },
      _newState: {
        _def: def,
        name: "test",
        credentials: {
          apiKey: "new-key",
          has_apiKey: true,
          username: "new-user",
        },
      },
    };

    const result = registered.oneditsave.call(node);
    expect(result.changed).toBe(true);
    expect(result.history[0].changes.credentials).toEqual({
      apiKey: "old-key",
      username: "old-user",
    });
    expect(node.credentials.apiKey).toBe("new-key");
    expect(node.credentials.username).toBe("new-user");
  });

  it("manages config node users on reference change", async () => {
    await register({
      type: "save-cfgref-node",
      category: "function",
      defaults: {
        name: { value: "" },
        server: { value: "", type: "my-server" },
      },
    });

    const registered = spy.mock.calls[0][1];
    const def = { defaults: registered.defaults };
    const node: any = {
      id: "n1",
      _def: def,
      name: "test",
      server: "old-srv",
      credentials: {},
      _newState: {
        _def: def,
        name: "test",
        server: "new-srv",
        credentials: {},
      },
    };

    const oldCfg: any = {
      _def: { category: "config" },
      users: [{ id: "n1" }, { id: "n2" }],
    };
    const newCfg: any = {
      _def: { category: "config" },
      users: [],
    };
    const nodeSpy = vi.spyOn(RED.nodes, "node" as any).mockImplementation(((
      id: string,
    ) => {
      if (id === "old-srv") return oldCfg;
      if (id === "new-srv") return newCfg;
      return null;
    }) as any);

    registered.oneditsave.call(node);

    expect(oldCfg.users).toEqual([{ id: "n2" }]);
    expect(newCfg.users).toHaveLength(1);
    expect(newCfg.users[0]).toBe(node);
    nodeSpy.mockRestore();
  });

  it("does not duplicate node in config node users when reference is unchanged", async () => {
    await register({
      type: "save-samecfg-node",
      category: "function",
      defaults: {
        name: { value: "" },
        server: { value: "", type: "my-server" },
      },
    });

    const registered = spy.mock.calls[0][1];
    const def = { defaults: registered.defaults };
    const node: any = {
      id: "n1",
      _def: def,
      name: "old",
      server: "same-srv",
      credentials: {},
      _newState: {
        _def: def,
        name: "new",
        server: "same-srv",
        credentials: {},
      },
    };

    const cfg: any = {
      _def: { category: "config" },
      users: [{ id: "n1" }],
    };
    const nodeSpy = vi.spyOn(RED.nodes, "node" as any).mockReturnValue(cfg);

    registered.oneditsave.call(node);

    expect(cfg.users).toHaveLength(1);
    expect(cfg.users[0]).toEqual({ id: "n1" });
    nodeSpy.mockRestore();
  });

  it("returns undefined for config category nodes", async () => {
    await register({
      type: "save-config-cat-node",
      category: "config",
      defaults: { name: { value: "" } },
    });

    const registered = spy.mock.calls[0][1];
    const def = { defaults: registered.defaults };
    const node: any = {
      id: "n1",
      _def: def,
      name: "old",
      credentials: {},
      _newState: { _def: def, name: "new", credentials: {} },
    };

    const result = registered.oneditsave.call(node);
    expect(result).toBeUndefined();
    expect(node.name).toBe("new");
  });
});

describe("registerType — oneditcancel / oneditdelete", () => {
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = spyOnRegisterType();
    vi.clearAllMocks();
  });

  it("oneditcancel calls unmountApp", async () => {
    await register(MINIMAL_DEFINITION);

    const registered = spy.mock.calls[0][1];
    const node: any = {};
    registered.oneditcancel.call(node);
    expect(vi.mocked(unmountApp)).toHaveBeenCalledWith(node);
  });

  it("oneditdelete calls unmountApp", async () => {
    await register(MINIMAL_DEFINITION);

    const registered = spy.mock.calls[0][1];
    const node: any = {};
    registered.oneditdelete.call(node);
    expect(vi.mocked(unmountApp)).toHaveBeenCalledWith(node);
  });
});

describe("registerTypes", () => {
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = spyOnRegisterType();
    vi.clearAllMocks();
  });

  it("registers all node definitions", async () => {
    await registerTypes([
      { type: "node-a", category: "function" },
      { type: "node-b", category: "input" },
      { type: "node-c", category: "output" },
    ]);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[0][0]).toBe("node-a");
    expect(spy.mock.calls[1][0]).toBe("node-b");
    expect(spy.mock.calls[2][0]).toBe("node-c");
  });

  it("throws when any registration fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    spy
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("fail");
      });

    await expect(
      registerTypes([
        { type: "ok-node-2", category: "function" },
        { type: "bad-node-2", category: "function" },
      ]),
    ).rejects.toThrow("fail");
    errorSpy.mockRestore();
  });
});
