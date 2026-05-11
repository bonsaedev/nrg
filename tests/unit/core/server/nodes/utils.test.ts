import { describe, it, expect, vi } from "vitest";
import {
  setupConfigProxy,
  setupContext,
} from "../../../../../src/core/server/nodes/utils";
import {
  defineSchema,
  SchemaType,
} from "../../../../../src/core/server/schemas";
import { defineConfigNode } from "../../../../../src/core/server/nodes/factories";
import type TypedInput from "../../../../../src/core/server/typed-input";
import { NrgError } from "../../../../../src/core/errors";
import { createNodeRedRuntime, createNodeRedNode, createContextStore } from "../../../../mocks/red";

const RemoteServer = defineConfigNode({ type: "remote-server" });
const SomeNode = defineConfigNode({ type: "something" });

describe("setupConfigProxy", () => {
  describe("node reference resolution", () => {
    it("should resolve node references marked with x-nrg-node-type", () => {
      const nrgInstance = { id: "server-1", type: "remote-server", config: { host: "localhost" } };
      const nodeRedNode = createNodeRedNode({ id: "server-1", type: "remote-server", _node: nrgInstance });
      const RED = createNodeRedRuntime({
        nodes: { "server-1": nodeRedNode },
      });

      const config = { server: "server-1", name: "test" };
      const schema = defineSchema({
        server: SchemaType.NodeRef(RemoteServer),
        name: SchemaType.String(),
      });

      const proxy = setupConfigProxy({ RED, node: nodeRedNode, config, schema });
      expect(proxy.server).toBe(nrgInstance);
    });

    it("should NOT resolve plain strings as node references", () => {
      const RED = createNodeRedRuntime();
      const config = { server: "some-string", name: "my-node" };
      const schema = defineSchema({
        server: SchemaType.String(),
        name: SchemaType.String(),
      });

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      expect(proxy.server).toBe("some-string");
      expect(proxy.name).toBe("my-node");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("should return the raw ID when node is not found", () => {
      const RED = createNodeRedRuntime({});
      const config = { server: "missing-id" };
      const schema = defineSchema({
        server: SchemaType.NodeRef(RemoteServer),
      });

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      expect(proxy.server).toBe("missing-id");
    });

    it("should not resolve empty strings", () => {
      const RED = createNodeRedRuntime();
      const config = { server: "" };
      const schema = defineSchema({
        server: SchemaType.NodeRef(RemoteServer),
      });

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      expect(proxy.server).toBe("");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });
  });

  describe("reference equality (WeakMap cache)", () => {
    it("should return the same proxy for the same nested object", () => {
      const RED = createNodeRedRuntime();
      const nested = { value: "str", type: "str" };
      const config = { myProp: nested };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.myProp).toBe(proxy.myProp);
    });

    it("should return the same mapped array on repeated access", () => {
      const RED = createNodeRedRuntime();
      const config = { tags: ["a", "b", "c"] };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.tags).toBe(proxy.tags);
    });
  });

  describe("read-only (set trap)", () => {
    it("should throw NrgError when setting a property", () => {
      const RED = createNodeRedRuntime();
      const config = { name: "test" };
      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });

      expect(() => {
        (proxy as any).name = "changed";
      }).toThrow(NrgError);
    });

    it("should include property name in error message", () => {
      const RED = createNodeRedRuntime();
      const config = { name: "test" };
      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });

      expect(() => {
        (proxy as any).name = "changed";
      }).toThrow(/name/);
    });
  });

  describe("skip props", () => {
    it("should return raw value for id", () => {
      const RED = createNodeRedRuntime();
      const config = { id: "node-123", name: "test" };
      const schema = defineSchema({
        id: SchemaType.NodeRef(SomeNode),
      });

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      expect(proxy.id).toBe("node-123");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("should return raw value for _id and _users", () => {
      const RED = createNodeRedRuntime();
      const config = { _id: "abc", _users: ["u1", "u2"] } as any;

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy._id).toBe("abc");
      expect(proxy._users).toEqual(["u1", "u2"]);
    });
  });

  describe("nested objects and arrays", () => {
    it("should proxy nested objects", () => {
      const RED = createNodeRedRuntime();
      const config = { settings: { timeout: 5000 } };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.settings.timeout).toBe(5000);
    });

    it("should handle arrays of objects", () => {
      const RED = createNodeRedRuntime();
      const config = { items: [{ name: "a" }, { name: "b" }] };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.items[0].name).toBe("a");
      expect(proxy.items[1].name).toBe("b");
    });

    it("should handle arrays of primitives", () => {
      const RED = createNodeRedRuntime();
      const config = { tags: ["alpha", "beta"] };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.tags).toEqual(["alpha", "beta"]);
    });

    it("should return primitives as-is", () => {
      const RED = createNodeRedRuntime();
      const config = { count: 42, enabled: true, label: null };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.count).toBe(42);
      expect(proxy.enabled).toBe(true);
      expect(proxy.label).toBeNull();
    });
  });

  describe("without schema", () => {
    it("should not resolve any strings when no schema is provided", () => {
      const RED = createNodeRedRuntime({ nodes: { test: { _node: {} } } });
      const config = { name: "test" };

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config });
      expect(proxy.name).toBe("test");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });
  });

  describe("TypedInput resolution", () => {
    function makeTypedInputSchema() {
      return defineSchema({
        target: SchemaType.TypedInput(),
        name: SchemaType.String(),
      });
    }

    it("should return a TypedInputRef for TypedInput-marked props", () => {
      const RED = createNodeRedRuntime();
      const config = {
        target: { value: "payload", type: "msg" },
        name: "test",
      };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      const ref = proxy.target;
      expect(ref).toBeDefined();
      expect(ref.type).toBe("msg");
      expect(ref.value).toBe("payload");
    });

    it("should return the same TypedInputRef on repeated access (cache)", () => {
      const RED = createNodeRedRuntime();
      const config = { target: { value: "x", type: "str" }, name: "test" };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      expect(proxy.target).toBe(proxy.target);
    });

    it("should resolve a TypedInputRef via evaluateNodeProperty", async () => {
      const RED = createNodeRedRuntime();
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "resolved-value"),
      );
      const node = createNodeRedNode();
      const config = { target: { value: "payload", type: "msg" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node, config, schema });
      const result = await (proxy.target as TypedInput<any>).resolve({ payload: "hello" });
      expect(result).toBe("resolved-value");
      expect(RED.util.evaluateNodeProperty).toHaveBeenCalledWith(
        "payload",
        "msg",
        node,
        { payload: "hello" },
        expect.any(Function),
      );
    });

    it("should reject when evaluateNodeProperty returns an error", async () => {
      const RED = createNodeRedRuntime();
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(new Error("eval failed")),
      );
      const config = { target: { value: "x", type: "str" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      await expect((proxy.target as TypedInput<any>).resolve()).rejects.toThrow("eval failed");
    });

    it("should resolve node ID to NRG node instance for node-type inputs", async () => {
      const nrgInstance = { id: "n1", type: "test", config: { name: "test" } };
      const rawNode = { _node: nrgInstance };
      const RED = createNodeRedRuntime({ nodes: { n1: rawNode } });
      // evaluateNodeProperty returns the string ID for "node" type
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "n1"),
      );
      const config = { target: { value: "n1", type: "node" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      const result = await (proxy.target as TypedInput<any>).resolve();
      expect(result).toBe(nrgInstance);
      expect(RED.nodes.getNode).toHaveBeenCalledWith("n1");
    });

    it("should return raw node when no NRG wrapper exists", async () => {
      const rawNode = { id: "n2", type: "debug" };
      const RED = createNodeRedRuntime({ nodes: { n2: rawNode } });
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "n2"),
      );
      const config = { target: { value: "n2", type: "node" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      const result = await (proxy.target as TypedInput<any>).resolve();
      expect(result).toBe(rawNode);
    });

    it("should return the ID string when node is not found", async () => {
      const RED = createNodeRedRuntime({});
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "missing-id"),
      );
      const config = { target: { value: "missing-id", type: "node" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      const result = await (proxy.target as TypedInput<any>).resolve();
      expect(result).toBe("missing-id");
    });

    it("should not wrap non-TypedInput objects as refs", () => {
      const RED = createNodeRedRuntime();
      const config = { settings: { value: "x", type: "str" }, name: "test" };
      const schema = defineSchema({
        settings: SchemaType.Object({}),
        name: SchemaType.String(),
      });

      const proxy = setupConfigProxy({ RED, node: createNodeRedNode(), config, schema });
      expect(proxy.settings.value).toBe("x");
      expect(typeof (proxy.settings as any).resolve).toBe("undefined");
    });
  });
});

describe("setupContext", () => {
  it("should get a value", async () => {
    const store = createContextStore();
    store.get.mockImplementation((key: string, _store: any, cb: Function) =>
      cb(null, "hello"),
    );

    const ctx = setupContext(store);
    const value = await ctx.get("test");
    expect(value).toBe("hello");
  });

  it("should set a value", async () => {
    const store = createContextStore();
    const ctx = setupContext(store);
    await ctx.set("key", "value");
    expect(store.set).toHaveBeenCalledWith(
      "key",
      "value",
      undefined,
      expect.any(Function),
    );
  });

  it("should get keys", async () => {
    const store = createContextStore();
    const ctx = setupContext(store);
    await ctx.set("a", 1);
    await ctx.set("b", 2);
    const keys = await ctx.keys();
    expect(keys).toEqual(["a", "b"]);
  });

  it("should reject on get error", async () => {
    const store = createContextStore();
    store.get.mockImplementation((_key: string, _store: any, cb: Function) =>
      cb(new Error("get failed")),
    );

    const ctx = setupContext(store);
    await expect(ctx.get("test")).rejects.toThrow("get failed");
  });

  it("should reject on set error", async () => {
    const store = createContextStore();
    store.set.mockImplementation(
      (_key: string, _val: any, _store: any, cb: Function) =>
        cb(new Error("set failed")),
    );

    const ctx = setupContext(store);
    await expect(ctx.set("key", "val")).rejects.toThrow("set failed");
  });

  it("should reject on keys error", async () => {
    const store = createContextStore();
    store.keys.mockImplementation((_store: any, cb: Function) =>
      cb(new Error("keys failed")),
    );

    const ctx = setupContext(store);
    await expect(ctx.keys()).rejects.toThrow("keys failed");
  });

  it("should pass store name to context methods", async () => {
    const store = createContextStore();
    const ctx = setupContext(store, "file");
    await ctx.set("key", "value");
    expect(store.set).toHaveBeenCalledWith(
      "key",
      "value",
      "file",
      expect.any(Function),
    );
  });
});
