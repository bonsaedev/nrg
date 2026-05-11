import { describe, it, expect, vi } from "vitest";
import { IONode } from "../../../../../src/core/server/nodes/io-node";
import { initValidator } from "../../../../../src/core/server/validation";
import {
  defineSchema,
  SchemaType,
} from "../../../../../src/core/server/schemas";
import { createMockRED, createMockNodeRedNode } from "../../../../mocks/red";

class TestIONode extends IONode {
  static override readonly type = "test-io-node";
  static override readonly category = "function";
  static override readonly color = "#ffffff" as const;
  static override readonly inputSchema = SchemaType.Object({});
  static override readonly outputsSchema = SchemaType.Object({});

  public inputCalled = false;
  public lastMsg: any = null;

  public async input(msg: any) {
    this.inputCalled = true;
    this.lastMsg = msg;
  }
}

describe("IONode", () => {

  describe("constructor", () => {
    it("should set up context with node, flow, and global", () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

      expect(instance.context).toBeDefined();
      expect(instance.context.node).toBeDefined();
      expect(instance.context.flow).toBeDefined();
      expect(instance.context.global).toBeDefined();
    });

    it("should support context as a function with scope", async () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

      const nodeCtx = instance.context("node");
      expect(nodeCtx).toBeDefined();
      expect(nodeCtx.get).toBeDefined();
      expect(nodeCtx.set).toBeDefined();
      expect(nodeCtx.keys).toBeDefined();
    });
  });

  describe("properties", () => {
    it("should expose x, y, g, wires from underlying node", () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

      expect(instance.x).toBe(100);
      expect(instance.y).toBe(200);
      expect(instance.g).toBe("group-1");
      expect(instance.wires).toEqual([["node-2"]]);
    });
  });

  describe("_input", () => {
    it("should call input method with message", async () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});
      const send = vi.fn();

      await instance._input({ payload: "test" }, send);
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
        public async input() {}
      }

      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (ValidatedIONode as any)(RED, node, {}, {});

      await expect(instance._input({ payload: "" }, vi.fn())).rejects.toThrow();
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
        public async input() {}
      }

      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (NoValidateIONode as any)(RED, node, {}, {});

      await expect(
        instance._input({ payload: "" }, vi.fn()),
      ).resolves.not.toThrow();
    });
  });

  describe("send", () => {
    it("should use _send when inside _input", async () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();

      class SendingNode extends IONode {
        static override readonly type = "sending-node";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        public async input() {
          this.send({ payload: "result" });
        }
      }

      const instance = new (SendingNode as any)(RED, node, {}, {});
      const send = vi.fn();
      await instance._input({}, send);

      expect(send).toHaveBeenCalledWith({ payload: "result" });
      expect(node.send).not.toHaveBeenCalled();
    });

    it("should fall back to node.send outside _input", () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

      instance.send({ payload: "test" });
      expect(node.send).toHaveBeenCalledWith({ payload: "test" });
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
        public async input() {}
      }

      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (MultiOutputNode as any)(RED, node, {}, {});

      // Valid: first port has data, second is null
      expect(() => instance.send([{ result: "ok" }, null])).not.toThrow();

      // Invalid: first port has empty result
      expect(() => instance.send([{ result: "" }, null])).toThrow();
    });

    it("should validate array of messages against single schema", () => {
      const outputSchema = defineSchema(
        { payload: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-single-array-test" },
      );

      class SingleSchemaArrayNode extends IONode {
        static override readonly type = "single-schema-array";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = outputSchema;
        public async input() {}
      }

      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (SingleSchemaArrayNode as any)(RED, node, {}, {});

      // Valid array of messages
      expect(() =>
        instance.send([{ payload: "a" }, null, { payload: "b" }]),
      ).not.toThrow();

      // Invalid: one message fails
      expect(() => instance.send([{ payload: "" }])).toThrow();
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
        public async input() {}
      }

      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (ValidatedOutputNode as any)(RED, node, {}, {});

      expect(() => instance.send({ result: "" })).toThrow();
    });
  });

  describe("status", () => {
    it("should delegate to node.status", () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

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
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

      instance.updateWires([["a"], ["b"]]);
      expect(node.updateWires).toHaveBeenCalledWith([["a"], ["b"]]);
    });
  });

  describe("receive", () => {
    it("should delegate to node.receive", () => {
      const RED = createMockRED();
      initValidator(RED);
      const node = createMockNodeRedNode();
      const instance = new (TestIONode as any)(RED, node, {}, {});

      instance.receive({ payload: "test" });
      expect(node.receive).toHaveBeenCalledWith({ payload: "test" });
    });
  });
});
