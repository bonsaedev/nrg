import { describe, it, expect, vi } from "vitest";
import {
  setupConfigProxy,
  setupContext,
} from "../../../../../src/core/server/nodes/utils";
import { NrgError } from "../../../../../src/core/errors";
import { createMockRED } from "../../../../mocks/red";

describe("setupConfigProxy", () => {
  describe("node reference resolution", () => {
    it("should resolve node references marked with x-nrg-node-type", () => {
      const mockNode = { _node: { id: "node-1", type: "remote-server" } };
      const RED = createMockRED({ "abc123": mockNode });

      const config = { server: "abc123", name: "test" };
      const schema = {
        properties: {
          server: { "x-nrg-node-type": "remote-server" },
          name: { type: "string" },
        },
      };

      const proxy = setupConfigProxy(RED, config, schema);
      expect(proxy.server).toBe(mockNode._node);
    });

    it("should NOT resolve plain strings as node references", () => {
      const RED = createMockRED();
      const config = { name: "my-node", url: "https://example.com" };
      const schema = {
        properties: {
          name: { type: "string" },
          url: { type: "string" },
        },
      };

      const proxy = setupConfigProxy(RED, config, schema);
      expect(proxy.name).toBe("my-node");
      expect(proxy.url).toBe("https://example.com");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("should return the raw ID when node is not found", () => {
      const RED = createMockRED({});
      const config = { server: "missing-id" };
      const schema = {
        properties: {
          server: { "x-nrg-node-type": "remote-server" },
        },
      };

      const proxy = setupConfigProxy(RED, config, schema);
      expect(proxy.server).toBe("missing-id");
    });

    it("should not resolve empty strings", () => {
      const RED = createMockRED();
      const config = { server: "" };
      const schema = {
        properties: {
          server: { "x-nrg-node-type": "remote-server" },
        },
      };

      const proxy = setupConfigProxy(RED, config, schema);
      expect(proxy.server).toBe("");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });
  });

  describe("reference equality (WeakMap cache)", () => {
    it("should return the same proxy for the same nested object", () => {
      const RED = createMockRED();
      const nested = { value: "str", type: "str" };
      const config = { myProp: nested };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.myProp).toBe(proxy.myProp);
    });

    it("should return the same mapped array on repeated access", () => {
      const RED = createMockRED();
      const config = { tags: ["a", "b", "c"] };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.tags).toBe(proxy.tags);
    });
  });

  describe("read-only (set trap)", () => {
    it("should throw NrgError when setting a property", () => {
      const RED = createMockRED();
      const config = { name: "test" };
      const proxy = setupConfigProxy(RED, config);

      expect(() => {
        (proxy as any).name = "changed";
      }).toThrow(NrgError);
    });

    it("should include property name in error message", () => {
      const RED = createMockRED();
      const config = { name: "test" };
      const proxy = setupConfigProxy(RED, config);

      expect(() => {
        (proxy as any).name = "changed";
      }).toThrow(/name/);
    });
  });

  describe("skip props", () => {
    it("should return raw value for id", () => {
      const RED = createMockRED();
      const config = { id: "node-123", name: "test" };
      const schema = {
        properties: {
          id: { "x-nrg-node-type": "something" },
        },
      };

      const proxy = setupConfigProxy(RED, config, schema);
      expect(proxy.id).toBe("node-123");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("should return raw value for _id and _users", () => {
      const RED = createMockRED();
      const config = { _id: "abc", _users: ["u1", "u2"] } as any;

      const proxy = setupConfigProxy(RED, config);
      expect(proxy._id).toBe("abc");
      expect(proxy._users).toEqual(["u1", "u2"]);
    });
  });

  describe("nested objects and arrays", () => {
    it("should proxy nested objects", () => {
      const RED = createMockRED();
      const config = { settings: { timeout: 5000 } };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.settings.timeout).toBe(5000);
    });

    it("should handle arrays of objects", () => {
      const RED = createMockRED();
      const config = { items: [{ name: "a" }, { name: "b" }] };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.items[0].name).toBe("a");
      expect(proxy.items[1].name).toBe("b");
    });

    it("should handle arrays of primitives", () => {
      const RED = createMockRED();
      const config = { tags: ["alpha", "beta"] };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.tags).toEqual(["alpha", "beta"]);
    });

    it("should return primitives as-is", () => {
      const RED = createMockRED();
      const config = { count: 42, enabled: true, label: null };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.count).toBe(42);
      expect(proxy.enabled).toBe(true);
      expect(proxy.label).toBeNull();
    });
  });

  describe("without schema", () => {
    it("should not resolve any strings when no schema is provided", () => {
      const RED = createMockRED({ "test": { _node: {} } });
      const config = { name: "test" };

      const proxy = setupConfigProxy(RED, config);
      expect(proxy.name).toBe("test");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });
  });
});

describe("setupContext", () => {
  function createMockContext(): any {
    const store: Record<string, any> = {};
    return {
      get: vi.fn(
        (key: string, _store: string | undefined, cb: Function) => {
          cb(null, store[key]);
        },
      ),
      set: vi.fn(
        (
          key: string,
          value: any,
          _store: string | undefined,
          cb: Function,
        ) => {
          store[key] = value;
          cb(null);
        },
      ),
      keys: vi.fn((_store: string | undefined, cb: Function) => {
        cb(null, Object.keys(store));
      }),
    };
  }

  it("should get a value", async () => {
    const mockCtx = createMockContext();
    mockCtx.get.mockImplementation(
      (key: string, _store: any, cb: Function) => cb(null, "hello"),
    );

    const ctx = setupContext(mockCtx);
    const value = await ctx.get("test");
    expect(value).toBe("hello");
  });

  it("should set a value", async () => {
    const mockCtx = createMockContext();
    const ctx = setupContext(mockCtx);
    await ctx.set("key", "value");
    expect(mockCtx.set).toHaveBeenCalledWith(
      "key",
      "value",
      undefined,
      expect.any(Function),
    );
  });

  it("should get keys", async () => {
    const mockCtx = createMockContext();
    const ctx = setupContext(mockCtx);
    await ctx.set("a", 1);
    await ctx.set("b", 2);
    const keys = await ctx.keys();
    expect(keys).toEqual(["a", "b"]);
  });

  it("should reject on get error", async () => {
    const mockCtx = createMockContext();
    mockCtx.get.mockImplementation(
      (_key: string, _store: any, cb: Function) =>
        cb(new Error("get failed")),
    );

    const ctx = setupContext(mockCtx);
    await expect(ctx.get("test")).rejects.toThrow("get failed");
  });

  it("should reject on set error", async () => {
    const mockCtx = createMockContext();
    mockCtx.set.mockImplementation(
      (_key: string, _val: any, _store: any, cb: Function) =>
        cb(new Error("set failed")),
    );

    const ctx = setupContext(mockCtx);
    await expect(ctx.set("key", "val")).rejects.toThrow("set failed");
  });

  it("should reject on keys error", async () => {
    const mockCtx = createMockContext();
    mockCtx.keys.mockImplementation((_store: any, cb: Function) =>
      cb(new Error("keys failed")),
    );

    const ctx = setupContext(mockCtx);
    await expect(ctx.keys()).rejects.toThrow("keys failed");
  });

  it("should pass store name to context methods", async () => {
    const mockCtx = createMockContext();
    const ctx = setupContext(mockCtx, "file");
    await ctx.set("key", "value");
    expect(mockCtx.set).toHaveBeenCalledWith(
      "key",
      "value",
      "file",
      expect.any(Function),
    );
  });
});
