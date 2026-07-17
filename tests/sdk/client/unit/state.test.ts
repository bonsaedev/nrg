import { describe, it, expect } from "vitest";
import { getNodeState, getChanges, applyState } from "@/sdk/lib/client/state";

describe("getNodeState", () => {
  it("extracts properties listed in _def.defaults", () => {
    const node: any = {
      _def: { defaults: { name: { value: "" }, count: { value: 0 } } },
      name: "hello",
      count: 5,
    };
    const state = getNodeState(node);
    expect(state.name).toBe("hello");
    expect(state.count).toBe(5);
    expect(state.credentials).toEqual({});
  });

  it("returns empty state when no defaults", () => {
    const node: any = { _def: {}, name: "ignored" };
    const state = getNodeState(node);
    expect(state).toEqual({ credentials: {} });
  });

  it("extracts credentials", () => {
    const node: any = {
      _def: {
        defaults: {},
        credentials: { username: { type: "text" } },
      },
      credentials: { username: "admin" },
    };
    const state = getNodeState(node);
    expect(state.credentials.username).toBe("admin");
  });

  it("includes has_ flag for password credentials", () => {
    const node: any = {
      _def: {
        defaults: {},
        credentials: { apiKey: { type: "password" } },
      },
      credentials: { apiKey: "secret", has_apiKey: true },
    };
    const state = getNodeState(node);
    expect(state.credentials.apiKey).toBe("secret");
    expect(state.credentials.has_apiKey).toBe(true);
  });

  it("defaults has_ flag to false when missing", () => {
    const node: any = {
      _def: {
        defaults: {},
        credentials: { apiKey: { type: "password" } },
      },
      credentials: { apiKey: "" },
    };
    const state = getNodeState(node);
    expect(state.credentials.has_apiKey).toBe(false);
  });

  it("handles missing credentials object on node", () => {
    const node: any = {
      _def: {
        defaults: {},
        credentials: { token: { type: "text" } },
      },
    };
    const state = getNodeState(node);
    expect(state.credentials.token).toBeUndefined();
  });
});

describe("getChanges", () => {
  it("returns empty object when values are equal", () => {
    expect(getChanges({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual({});
  });

  it("returns old value for changed primitives", () => {
    expect(getChanges({ a: 1 }, { a: 2 })).toEqual({ a: 1 });
  });

  it("detects added keys", () => {
    expect(getChanges({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: undefined });
  });

  it("detects removed keys", () => {
    expect(getChanges({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: 2 });
  });

  it("recurses into nested objects", () => {
    const o = { nested: { x: 1, y: 2 } };
    const n = { nested: { x: 1, y: 3 } };
    expect(getChanges(o, n)).toEqual({ nested: { y: 2 } });
  });

  it("skips nested objects with no changes", () => {
    const o = { nested: { x: 1 } };
    const n = { nested: { x: 1 } };
    expect(getChanges(o, n)).toEqual({});
  });

  it("compares arrays by value", () => {
    expect(getChanges({ a: [1, 2] }, { a: [1, 2] })).toEqual({});
    expect(getChanges({ a: [1, 2] }, { a: [1, 3] })).toEqual({ a: [1, 2] });
  });

  it("treats null as a primitive", () => {
    expect(getChanges({ a: null }, { a: null })).toEqual({});
    expect(getChanges({ a: null }, { a: 1 })).toEqual({ a: null });
  });

  it("handles null new object", () => {
    expect(getChanges({ a: 1 }, null as any)).toEqual({ a: 1 });
  });

  it("detects old object replaced by null", () => {
    const o = { nested: { x: 1 } };
    const n = { nested: null };
    const changes = getChanges(o, n as any);
    expect(changes).toHaveProperty("nested");
    expect(changes.nested).toEqual({ x: 1 });
  });
});

describe("applyState", () => {
  it("copies primitive values", () => {
    const target: any = { a: 1 };
    applyState(target, { a: 2, b: "new" });
    expect(target.a).toBe(2);
    expect(target.b).toBe("new");
  });

  it("clones arrays", () => {
    const source = { tags: ["a", "b"] };
    const target: any = {};
    applyState(target, source);
    expect(target.tags).toEqual(["a", "b"]);
    expect(target.tags).not.toBe(source.tags);
  });

  it("makes a nested object match the source, dropping removed keys", () => {
    // The save flow always applies the COMPLETE new state, so a key absent from
    // the source was cleared by the user and must not linger on the node.
    const target: any = { nested: { x: 1, y: 2 } };
    applyState(target, { nested: { y: 3 } });
    expect(target.nested).toEqual({ y: 3 });
  });

  it("clears a per-port map entry the user removed", () => {
    const target: any = { outputContextModes: { 0: "reset" } };
    applyState(target, { outputContextModes: {} });
    expect(target.outputContextModes).toEqual({});
  });

  it("creates target object when missing", () => {
    const target: any = {};
    applyState(target, { nested: { x: 1 } });
    expect(target.nested).toEqual({ x: 1 });
  });

  it("replaces non-object target with object", () => {
    const target: any = { nested: "string" };
    applyState(target, { nested: { x: 1 } });
    expect(target.nested).toEqual({ x: 1 });
  });

  it("replaces array target with object", () => {
    const target: any = { nested: [1, 2] };
    applyState(target, { nested: { x: 1 } });
    expect(target.nested).toEqual({ x: 1 });
  });

  it("does not mutate source", () => {
    const source = { a: { b: 1 } };
    const copy = JSON.parse(JSON.stringify(source));
    applyState({}, source);
    expect(source).toEqual(copy);
  });

  it("assigns null values directly", () => {
    const target: any = { key: "old" };
    applyState(target, { key: null });
    expect(target.key).toBeNull();
  });

  it("assigns undefined values directly", () => {
    const target: any = { key: "old" };
    applyState(target, { key: undefined });
    expect(target.key).toBeUndefined();
  });
});
