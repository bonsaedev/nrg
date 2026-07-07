import { describe, it, expect, vi } from "vitest";
import { setupConfigProxy } from "@/sdk/lib/server/nodes/proxy";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import { ConfigNode } from "@/sdk/lib/server/nodes/config-node";
import type TypedInput from "@/sdk/lib/server/typed-input";
import { NrgError } from "@/sdk/lib/shared/errors";
import { NRG_NODE, NRG_CONFIG_NODE } from "@/sdk/lib/server/nodes/symbols";
import { createRED, createNodeRedNode } from "@mocks/red";

class RemoteServer extends ConfigNode {
  static override readonly type = "remote-server";
}
class SomeNode extends ConfigNode {
  static override readonly type = "something";
}

describe("setupConfigProxy", () => {
  describe("node reference resolution", () => {
    it("should resolve node references marked with x-nrg-node-type", () => {
      const nrgInstance = {
        id: "server-1",
        type: "remote-server",
        config: { host: "localhost" },
      } as any;
      const RED = createRED();
      RED.registerNrgNode("server-1", nrgInstance);
      const nodeRedNode = createNodeRedNode({
        id: "server-1",
        type: "remote-server",
      });

      const config = { server: "server-1", name: "test" };
      const schema = defineSchema(
        {
          server: SchemaType.NodeRef(RemoteServer.type),
          name: SchemaType.String(),
        },
        { $id: "proxy.test:1" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: nodeRedNode,
        config,
        schema,
      });
      expect(proxy.server).toBe(nrgInstance);
    });

    it("should NOT resolve plain strings as node references", () => {
      const RED = createRED();
      const config = { server: "some-string", name: "my-node" };
      const schema = defineSchema(
        {
          server: SchemaType.String(),
          name: SchemaType.String(),
        },
        { $id: "proxy.test:2" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      expect(proxy.server).toBe("some-string");
      expect(proxy.name).toBe("my-node");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("should return the raw ID when node is not found", () => {
      const RED = createRED();
      const config = { server: "missing-id" };
      const schema = defineSchema(
        {
          server: SchemaType.NodeRef(RemoteServer.type),
        },
        { $id: "proxy.test:3" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      expect(proxy.server).toBe("missing-id");
    });

    it("resolves an unset (empty) reference to undefined, not the raw string", () => {
      const RED = createRED();
      const config = { server: "" };
      const schema = defineSchema(
        {
          server: SchemaType.NodeRef(RemoteServer.type),
        },
        { $id: "proxy.test:4" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      // undefined (not "") so optional-chaining / falsy guards behave and a
      // `this.config.server.method()` fails clearly instead of `"".method`.
      expect(proxy.server).toBeUndefined();
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("throws when a NodeRef resolves to a branded nrg node that is NOT a config node", () => {
      // The misconfiguration a JS author gets no compile-time help catching:
      // a config field pointing at an nrg node that isn't a config node. The
      // resolved target's class carries NRG_NODE but not the NRG_CONFIG_NODE
      // instance brand.
      class NrgIoNode {}
      (NrgIoNode as unknown as Record<symbol, unknown>)[NRG_NODE] = true;
      const ioInstance = new NrgIoNode() as Record<string, unknown>;
      ioInstance.id = "server-1";
      ioInstance.type = "remote-server";

      const RED = createRED();
      RED.registerNrgNode("server-1", ioInstance);
      const schema = defineSchema(
        {
          server: SchemaType.NodeRef(RemoteServer.type),
        },
        { $id: "proxy.test:5" },
      );
      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode({ id: "server-1", type: "remote-server" }),
        config: { server: "server-1" },
        schema,
      });

      expect(() => proxy.server).toThrow(NrgError);
      expect(() => proxy.server).toThrow(/not an nrg config node/);
    });

    it("resolves a NodeRef to a branded config node without throwing", () => {
      class NrgConfigNode {}
      (NrgConfigNode as unknown as Record<symbol, unknown>)[NRG_NODE] = true;
      const cfgInstance = new NrgConfigNode() as Record<
        string | symbol,
        unknown
      >;
      cfgInstance.id = "server-1";
      cfgInstance.type = "remote-server";
      cfgInstance[NRG_CONFIG_NODE] = true; // the runtime config-node brand

      const RED = createRED();
      RED.registerNrgNode("server-1", cfgInstance);
      const schema = defineSchema(
        {
          server: SchemaType.NodeRef(RemoteServer.type),
        },
        { $id: "proxy.test:6" },
      );
      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode({ id: "server-1", type: "remote-server" }),
        config: { server: "server-1" },
        schema,
      });

      expect(proxy.server).toBe(cfgInstance);
    });
  });

  describe("reference equality (WeakMap cache)", () => {
    it("should return the same proxy for the same nested object", () => {
      const RED = createRED();
      const nested = { value: "str", type: "str" };
      const config = { myProp: nested };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.myProp).toBe(proxy.myProp);
    });

    it("should return the same mapped array on repeated access", () => {
      const RED = createRED();
      const config = { tags: ["a", "b", "c"] };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.tags).toBe(proxy.tags);
    });
  });

  describe("read-only (set trap)", () => {
    it("should throw NrgError when setting a property", () => {
      const RED = createRED();
      const config = { name: "test" };
      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });

      expect(() => {
        (proxy as any).name = "changed";
      }).toThrow(NrgError);
    });

    it("should include property name in error message", () => {
      const RED = createRED();
      const config = { name: "test" };
      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });

      expect(() => {
        (proxy as any).name = "changed";
      }).toThrow(/name/);
    });
  });

  describe("skip props", () => {
    it("should return raw value for id", () => {
      const RED = createRED();
      const config = { id: "node-123", name: "test" };
      const schema = defineSchema(
        {
          id: SchemaType.NodeRef(SomeNode.type),
        },
        { $id: "proxy.test:7" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      expect(proxy.id).toBe("node-123");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });

    it("should return raw value for _id and _users", () => {
      const RED = createRED();
      const config = { _id: "abc", _users: ["u1", "u2"] } as any;

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy._id).toBe("abc");
      expect(proxy._users).toEqual(["u1", "u2"]);
    });
  });

  describe("nested objects and arrays", () => {
    it("should proxy nested objects", () => {
      const RED = createRED();
      const config = { settings: { timeout: 5000 } };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.settings.timeout).toBe(5000);
    });

    it("should handle arrays of objects", () => {
      const RED = createRED();
      const config = { items: [{ name: "a" }, { name: "b" }] };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.items[0].name).toBe("a");
      expect(proxy.items[1].name).toBe("b");
    });

    it("should handle arrays of primitives", () => {
      const RED = createRED();
      const config = { tags: ["alpha", "beta"] };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.tags).toEqual(["alpha", "beta"]);
    });

    it("should return primitives as-is", () => {
      const RED = createRED();
      const config = { count: 42, enabled: true, label: null };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.count).toBe(42);
      expect(proxy.enabled).toBe(true);
      expect(proxy.label).toBeNull();
    });
  });

  describe("without schema", () => {
    it("should not resolve any strings when no schema is provided", () => {
      const RED = createRED();
      RED.registerNrgNode("test", {});
      const config = { name: "test" };

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
      });
      expect(proxy.name).toBe("test");
      expect(RED.nodes.getNode).not.toHaveBeenCalled();
    });
  });

  describe("TypedInput resolution", () => {
    function makeTypedInputSchema() {
      return defineSchema(
        {
          target: SchemaType.TypedInput(),
          name: SchemaType.String(),
        },
        { $id: "proxy.test:8" },
      );
    }

    it("should return a TypedInputRef for TypedInput-marked props", () => {
      const RED = createRED();
      const config = {
        target: { value: "payload", type: "msg" },
        name: "test",
      };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      const ref = proxy.target;
      expect(ref).toBeDefined();
      expect(ref.type).toBe("msg");
      expect(ref.value).toBe("payload");
    });

    it("should return the same TypedInputRef on repeated access (cache)", () => {
      const RED = createRED();
      const config = { target: { value: "x", type: "str" }, name: "test" };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      expect(proxy.target).toBe(proxy.target);
    });

    it("should resolve a TypedInputRef via evaluateNodeProperty", async () => {
      const RED = createRED();
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "resolved-value"),
      );
      const node = createNodeRedNode();
      const config = { target: { value: "payload", type: "msg" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({ RED, node, config, schema });
      const result = await (proxy.target as TypedInput<any>).resolve({
        payload: "hello",
      });
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
      const RED = createRED();
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(new Error("eval failed")),
      );
      const config = { target: { value: "x", type: "str" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      await expect((proxy.target as TypedInput<any>).resolve()).rejects.toThrow(
        "eval failed",
      );
    });

    it("should resolve node ID to NRG node instance for node-type inputs", async () => {
      const nrgInstance = { id: "n1", type: "test", config: { name: "test" } };
      const RED = createRED();
      RED.registerNrgNode("n1", nrgInstance);
      // evaluateNodeProperty returns the string ID for "node" type
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "n1"),
      );
      const config = { target: { value: "n1", type: "node" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      const result = await (proxy.target as TypedInput<any>).resolve();
      expect(result).toBe(nrgInstance);
      expect(RED.nodes.getNode).toHaveBeenCalledWith("n1");
    });

    it("should return raw node when no NRG wrapper exists", async () => {
      const rawNode = { id: "n2", type: "debug" };
      const RED = createRED();
      RED.registerNode("n2", rawNode);
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "n2"),
      );
      const config = { target: { value: "n2", type: "node" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      const result = await (proxy.target as TypedInput<any>).resolve();
      expect(result).toBe(rawNode);
    });

    it("should return the ID string when node is not found", async () => {
      const RED = createRED();
      vi.mocked(RED.util.evaluateNodeProperty).mockImplementation(
        (_val: any, _type: any, _node: any, _msg: any, cb: any) =>
          cb(null, "missing-id"),
      );
      const config = { target: { value: "missing-id", type: "node" } };
      const schema = makeTypedInputSchema();

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      const result = await (proxy.target as TypedInput<any>).resolve();
      expect(result).toBe("missing-id");
    });

    it("should not wrap non-TypedInput objects as refs", () => {
      const RED = createRED();
      const config = { settings: { value: "x", type: "str" }, name: "test" };
      const schema = defineSchema(
        {
          settings: SchemaType.Object({}),
          name: SchemaType.String(),
        },
        { $id: "proxy.test:9" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      });
      expect(proxy.settings.value).toBe("x");
      expect(typeof (proxy.settings as any).resolve).toBe("undefined");
    });
  });

  describe("path-aware resolution & read-only arrays", () => {
    it("does not resolve a nested field that shares a name with a top-level NodeRef", () => {
      const RED = createRED();
      const config = {
        server: "server-1", // a real top-level NodeRef
        nested: { server: "just-a-string" }, // same name, NOT a ref here
      };
      const schema = defineSchema(
        {
          server: SchemaType.NodeRef(RemoteServer.type),
          nested: SchemaType.Object({ server: SchemaType.String() }),
        },
        { $id: "proxy.test:nested-collision" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      }) as any;

      // Resolved by bare NAME (the old bug), `nested.server` would call
      // getNode("just-a-string"); path-aware resolution leaves it a raw string.
      expect(proxy.nested.server).toBe("just-a-string");
      expect(RED.nodes.getNode).not.toHaveBeenCalledWith("just-a-string");
    });

    it("resolves a NodeRef nested inside an object", () => {
      const nrgInstance = { id: "srv", type: "remote-server" } as any;
      const RED = createRED();
      RED.registerNrgNode("srv", nrgInstance);
      const config = { conn: { server: "srv" } };
      const schema = defineSchema(
        {
          conn: SchemaType.Object({
            server: SchemaType.NodeRef(RemoteServer.type),
          }),
        },
        { $id: "proxy.test:nested-ref" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      }) as any;

      // The type (ResolvedStatic) says nested refs resolve — now the runtime agrees.
      expect(proxy.conn.server).toBe(nrgInstance);
    });

    it("resolves NodeRefs inside array elements", () => {
      const a = { id: "a", type: "remote-server" } as any;
      const RED = createRED();
      RED.registerNrgNode("a", a);
      const config = { servers: [{ ref: "a" }] };
      const schema = defineSchema(
        {
          servers: SchemaType.Array(
            SchemaType.Object({ ref: SchemaType.NodeRef(RemoteServer.type) }),
          ),
        },
        { $id: "proxy.test:array-ref" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      }) as any;

      expect(proxy.servers[0].ref).toBe(a);
    });

    it("rejects writes to array fields, like objects", () => {
      const RED = createRED();
      const config = { tags: ["a", "b"] };
      const schema = defineSchema(
        { tags: SchemaType.Array(SchemaType.String()) },
        { $id: "proxy.test:array-write" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      }) as any;

      expect(proxy.tags[0]).toBe("a"); // reads still work
      expect(() => {
        proxy.tags[0] = "z";
      }).toThrow(NrgError);
      expect(() => proxy.tags.push("c")).toThrow(NrgError);
      // the raw config never diverges from a mutable copy
      expect(config.tags).toEqual(["a", "b"]);
    });

    it("rejects deleting a config property", () => {
      const RED = createRED();
      const config = { name: "x" };
      const schema = defineSchema(
        { name: SchemaType.String() },
        { $id: "proxy.test:delete" },
      );

      const proxy = setupConfigProxy({
        RED,
        node: createNodeRedNode(),
        config,
        schema,
      }) as any;

      expect(() => {
        delete proxy.name;
      }).toThrow(NrgError);
    });
  });
});
