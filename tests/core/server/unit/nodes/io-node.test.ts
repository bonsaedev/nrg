import { describe, it, expect, vi } from "vitest";
import { IONode } from "@/core/server/nodes/io-node";
import { initValidator } from "@/core/server/validation";
import { defineSchema, SchemaType } from "@/core/server/schemas";
import { createRED, createNodeRedNode } from "@mocks/red";
import { WIRE_HANDLERS } from "@/core/server/nodes/symbols";

class TestIONode extends IONode {
  static override readonly type = "test-io-node";
  static override readonly category = "function";
  static override readonly color = "#ffffff" as const;
  static override readonly inputSchema = SchemaType.Object({});
  static override readonly outputsSchema = SchemaType.Object({});

  public inputCalled = false;
  public lastMsg: any = null;

  public override async input(msg: any) {
    this.inputCalled = true;
    this.lastMsg = msg;
  }
}

describe("IONode", () => {
  describe("constructor", () => {
    it("should set up context with node, flow, and global", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      const ctx = (instance as any).context;
      expect(ctx).toBeDefined();
      expect(ctx.node).toBeDefined();
      expect(ctx.flow).toBeDefined();
      expect(ctx.global).toBeDefined();
    });

    it("should support context as a function with scope", async () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      const nodeCtx = (instance as any).context("node");
      expect(nodeCtx).toBeDefined();
      expect(nodeCtx.get).toBeDefined();
      expect(nodeCtx.set).toBeDefined();
      expect(nodeCtx.keys).toBeDefined();
    });
  });

  describe("properties", () => {
    it("should expose x, y, g, wires from underlying node", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      expect(instance.x).toBe(100);
      expect(instance.y).toBe(200);
      expect(instance.g).toBe("group-1");
      expect(instance.wires).toEqual([["node-2"]]);
    });
  });

  describe("input handling", () => {
    it("should call input method with message", async () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      // Wire up event handlers
      const createdPromise = Promise.resolve();
      instance[WIRE_HANDLERS](node, createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "test" }, send, done);

      expect(instance.inputCalled).toBe(true);
      expect(instance.lastMsg).toEqual({ payload: "test" });
    });

    it("should validate input when validateInput is true and inputSchema exists", async () => {
      const inputSchema = defineSchema(
        { payload: SchemaType.String({ minLength: 1 }) },
        { $id: "io-input-validation-test" },
      );

      class ValidatedIONode extends IONode {
        static override readonly type = "validated-io";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateInput = true;
        static override readonly inputSchema = inputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ValidatedIONode(RED, node, {}, {});

      const createdPromise = Promise.resolve();
      instance[WIRE_HANDLERS](node, createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "" }, send, done);

      // done should have been called with an error
      expect(done).toHaveBeenCalled();
      expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it("should not validate input when validateInput is false", async () => {
      const inputSchema = defineSchema(
        { payload: SchemaType.String({ minLength: 1 }) },
        { $id: "io-no-input-validation-test" },
      );

      class NoValidateIONode extends IONode {
        static override readonly type = "no-validate-io";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateInput = false;
        static override readonly inputSchema = inputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new NoValidateIONode(RED, node, {}, {});

      const createdPromise = Promise.resolve();
      instance[WIRE_HANDLERS](node, createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "" }, send, done);

      // done should have been called without error
      expect(done).toHaveBeenCalledWith();
    });
  });

  describe("send", () => {
    it("should use send callback when inside input handler", async () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();

      class SendingNode extends IONode {
        static override readonly type = "sending-node";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        public override async input() {
          this.send("result");
        }
      }

      const instance = new SendingNode(RED, node, {}, {});
      const createdPromise = Promise.resolve();
      instance[WIRE_HANDLERS](node, createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", {}, send, done);

      // every send wraps under the return key (default "output") with the
      // input lineage
      expect(send).toHaveBeenCalledWith({ output: "result", input: {} });
    });

    it("should fall back to node.send outside input handler", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.send("test");
      expect(node.send).toHaveBeenCalledWith({ output: "test", input: {} });
    });

    it("should validate per-port with array of schemas", () => {
      const schema1 = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-port1-test" },
      );
      const schema2 = defineSchema(
        { error: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-port2-test" },
      );

      class MultiOutputNode extends IONode {
        static override readonly type = "multi-output";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = [schema1, schema2];
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new MultiOutputNode(RED, node, {}, {});

      // Valid: first port has data, second is null
      expect(() => instance.send([{ result: "ok" }, null])).not.toThrow();

      // Invalid: first port has empty result
      expect(() => instance.send([{ result: "" }, null])).toThrow();
    });

    it("validates an array sent from a single-output node as the value", () => {
      // A single-output node treats an array argument as the value (not as
      // per-port messages), so the schema describes the array itself.
      const outputSchema = SchemaType.Array(
        SchemaType.String({ minLength: 1 }),
        { $id: "io-output-single-array-test" },
      );

      class SingleSchemaArrayNode extends IONode {
        static override readonly type = "single-schema-array";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = outputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new SingleSchemaArrayNode(RED, node, {}, {});

      // Valid: the array value matches the array schema
      expect(() => instance.send(["a", "b"])).not.toThrow();

      // Invalid: an element fails the item schema
      expect(() => instance.send(["a", ""])).toThrow();
    });

    it("should validate output when validateOutput is true", () => {
      const outputSchema = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-validation-test" },
      );

      class ValidatedOutputNode extends IONode {
        static override readonly type = "validated-output";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = outputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ValidatedOutputNode(RED, node, {}, {});

      expect(() => instance.send({ result: "" })).toThrow();
    });
  });

  describe("status", () => {
    it("should delegate to node.status", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.status({ fill: "green", shape: "dot", text: "connected" });
      expect(node.status).toHaveBeenCalledWith({
        fill: "green",
        shape: "dot",
        text: "connected",
      });
    });
  });

  describe("updateWires", () => {
    it("should delegate to node.updateWires", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.updateWires([["a"], ["b"]]);
      expect(node.updateWires).toHaveBeenCalledWith([["a"], ["b"]]);
    });
  });

  describe("receive", () => {
    it("should delegate to node.receive", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.receive({ payload: "test" });
      expect(node.receive).toHaveBeenCalledWith({ payload: "test" });
    });
  });
});
