import { describe, test, expect, vi } from "vitest";
import {
  createRED,
  createNodeRedNode,
  createContextStore,
} from "@/sdk/test/server/unit/mocks";

function evaluate(
  red: ReturnType<typeof createRED>,
  value: any,
  type: string,
  msg?: any,
) {
  const callback = vi.fn();
  red.util.evaluateNodeProperty(value, type, {} as any, msg, callback);
  const [err, result] = callback.mock.calls[0];
  return { err, result };
}

describe("createRED", () => {
  test("spreads provided settings", () => {
    const red = createRED({ settings: { httpAdminRoot: "/admin" } });
    expect(red.settings.httpAdminRoot).toBe("/admin");
    expect(red.version()).toBe("0.0.0-test");
  });

  test("_ substitutes __placeholders__", () => {
    const red = createRED();
    expect(red._("plain.key")).toBe("plain.key");
    expect(red._("hello __name__ (__name2__)", { name: "a", name2: "b" })).toBe(
      "hello a (b)",
    );
  });

  test("addCredentials merges and getCredentials reads them back", () => {
    const red = createRED();
    red.nodes.addCredentials("cfg-1", { accessToken: "a", refreshToken: "r" });
    expect(red.nodes.getCredentials("cfg-1")).toEqual({
      accessToken: "a",
      refreshToken: "r",
    });

    // merge — a partial update keeps untouched keys
    red.nodes.addCredentials("cfg-1", { accessToken: "a2" });
    expect(red.nodes.getCredentials("cfg-1")).toEqual({
      accessToken: "a2",
      refreshToken: "r",
    });
    expect(red.nodes.getCredentials("missing")).toBeUndefined();
  });

  test("registerNode makes nodes resolvable via getNode", () => {
    const red = createRED();
    red.registerNode("n1", { id: "n1", type: "custom" } as any);
    expect(red.nodes.getNode("n1")).toMatchObject({ type: "custom" });
    expect(red.nodes.getNode("missing")).toBeUndefined();
  });

  test("registerNrgNode wraps the instance in a full NodeRED node", () => {
    const red = createRED();
    red.registerNrgNode("nrg-1", { type: "my-node" } as any);
    const node = red.nodes.getNode("nrg-1") as any;
    expect(node.id).toBe("nrg-1");
    expect(typeof node.send).toBe("function");
    expect(node._node).toMatchObject({ type: "my-node" });
  });
});

describe("RED.util.evaluateNodeProperty", () => {
  test.each([
    ["str", 42, undefined, "42"],
    ["num", "1.5", undefined, 1.5],
    ["bool", "true", undefined, true],
    ["bool", "false", undefined, false],
    ["json", '{"a":1}', undefined, { a: 1 }],
    ["json", { b: 2 }, undefined, { b: 2 }],
    ["msg", "payload.value", { payload: { value: "deep" } }, "deep"],
    ["node", "as-is", undefined, "as-is"],
    ["unknown-type", "raw", undefined, "raw"],
  ])("resolves %s", (type, value, msg, expected) => {
    const { err, result } = evaluate(createRED(), value, type as string, msg);
    expect(err).toBeNull();
    expect(result).toEqual(expected);
  });

  test("resolves date, bin and re types", () => {
    const red = createRED();
    expect(typeof evaluate(red, "", "date").result).toBe("number");
    expect(Buffer.isBuffer(evaluate(red, "abc", "bin").result)).toBe(true);
    expect(evaluate(red, "^a$", "re").result).toBeInstanceOf(RegExp);
  });

  test("context-backed types resolve to undefined in the mock", () => {
    const red = createRED();
    for (const type of ["jsonata", "flow", "global", "env", "cred"]) {
      expect(evaluate(red, "x", type).result).toBeUndefined();
    }
  });

  test("reports parse errors through the callback", () => {
    const { err, result } = evaluate(createRED(), "{not json", "json");
    expect(err).toBeInstanceOf(Error);
    expect(result).toBeUndefined();
  });
});

describe("RED.util message property helpers", () => {
  test("getMessageProperty walks dot paths", () => {
    const red = createRED();
    const msg = { payload: { user: { id: 7 } } };
    expect(red.util.getMessageProperty(msg, "payload.user.id")).toBe(7);
    expect(red.util.getMessageProperty(msg, "payload.missing.deep")).toBe(
      undefined,
    );
  });

  test("setMessageProperty creates missing segments when asked", () => {
    const red = createRED();
    const msg: any = {};
    expect(red.util.setMessageProperty(msg, "a.b.c", 1, true)).toBe(true);
    expect(msg.a.b.c).toBe(1);
  });

  test("setMessageProperty refuses missing segments without createMissing", () => {
    const red = createRED();
    const msg: any = {};
    expect(red.util.setMessageProperty(msg, "a.b", 1)).toBe(false);
    expect(msg.a).toBeUndefined();
  });

  test("setMessageProperty replaces non-object midpoints when creating", () => {
    const red = createRED();
    const msg: any = { a: "scalar" };
    expect(red.util.setMessageProperty(msg, "a.b", 2, true)).toBe(true);
    expect(msg.a.b).toBe(2);
  });

  test("cloneMessage deep-clones", () => {
    const red = createRED();
    const msg = { payload: { nested: [1, 2] } };
    const clone = red.util.cloneMessage(msg);
    expect(clone).toEqual(msg);
    expect(clone.payload).not.toBe(msg.payload);
  });
});

describe("createNodeRedNode", () => {
  test("applies defaults and overrides", () => {
    const node = createNodeRedNode({ type: "custom", name: "n" });
    expect(node.type).toBe("custom");
    expect(node.id).toMatch(/^node-/);
    expect(node.wires).toEqual([["node-2"]]);
  });

  test("on/emit dispatch registered handlers in order", async () => {
    const node = createNodeRedNode();
    const seen: string[] = [];
    node.on("input", () => {
      seen.push("first");
    });
    node.on("input", () => {
      seen.push("second");
    });

    await node.emit("input", { payload: 1 });
    expect(seen).toEqual(["first", "second"]);

    await node.emit("close");
    expect(seen).toEqual(["first", "second"]);
  });

  test("context stores roundtrip per scope", () => {
    const node = createNodeRedNode();
    const ctx: any = node.context();

    ctx.set("k", "node-value", undefined, () => {});
    ctx.flow.set("k", "flow-value", undefined, () => {});
    ctx.global.set("k", "global-value", undefined, () => {});

    const read = (store: any) => {
      let value: any;
      store.get("k", undefined, (_err: any, v: any) => {
        value = v;
      });
      return value;
    };
    expect(read(ctx)).toBe("node-value");
    expect(read(ctx.flow)).toBe("flow-value");
    expect(read(ctx.global)).toBe("global-value");
  });
});

describe("createContextStore", () => {
  test("keys lists stored entries", () => {
    const store = createContextStore();
    store.set("a", 1, undefined, () => {});
    store.set("b", 2, undefined, () => {});

    let keys: string[] = [];
    store.keys(undefined, (_err, k) => {
      keys = k!;
    });
    expect(keys.sort()).toEqual(["a", "b"]);
  });
});
