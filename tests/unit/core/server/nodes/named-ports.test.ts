import { describe, it, expect } from "vitest";
import { createNode } from "@/test";
import { defineIONode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/server/schemas";

const SuccessSchema = defineSchema(
  { payload: SchemaType.String() },
  { $id: "named-test:success" },
);

const FailureSchema = defineSchema(
  { payload: SchemaType.Object({ reason: SchemaType.String() }) },
  { $id: "named-test:failure" },
);

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-test:config" },
);

describe("named output ports", () => {
  describe("outputs count", () => {
    it("counts record keys as output ports", async () => {
      const Node = defineIONode({
        type: "named-count-test",
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        async input() {},
      });

      const { node } = await createNode(Node, {});
      expect(node.baseOutputs).toBe(2);
    });

    it("counts single schema as one output", async () => {
      const Node = defineIONode({
        type: "single-count-test",
        outputsSchema: SuccessSchema,
        async input() {},
      });

      const { node } = await createNode(Node, {});
      expect(node.baseOutputs).toBe(1);
    });

    it("throws on numeric record keys", () => {
      expect(() => {
        defineIONode({
          type: "numeric-key-test",
          outputsSchema: { "0": SuccessSchema, "1": FailureSchema },
          async input() {},
        });
        // Access the static getter to trigger validation
        const NC = defineIONode({
          type: "numeric-key-test-2",
          outputsSchema: { "0": SuccessSchema, "1": FailureSchema },
          async input() {},
        }) as any;
        NC.outputs;
      }).toThrow(/numeric/i);
    });

    it.each(["error", "complete", "status"])(
      "throws on reserved port name '%s'",
      (name) => {
        const NC = defineIONode({
          type: `reserved-name-${name}-test`,
          outputsSchema: { [name]: SuccessSchema },
          async input() {},
        }) as any;
        expect(() => NC.outputs).toThrow(/reserved/i);
      },
    );
  });

  describe("sendToPort with named ports", () => {
    it("sends to named port by string", async () => {
      const Node = defineIONode({
        type: "named-send-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        async input(msg) {
          this.sendToPort("success", { payload: "ok" });
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      const msg = sent[0] as unknown as any[];
      expect(msg[0]).toEqual({ payload: "ok" });
      expect(msg[1]).toBeUndefined();
    });

    it("sends to second named port", async () => {
      const Node = defineIONode({
        type: "named-send-second-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        async input() {
          this.sendToPort("failure", { payload: { reason: "bad" } });
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      const msg = sent[0] as unknown as any[];
      expect(msg[0]).toBeUndefined();
      expect(msg[1]).toEqual({ payload: { reason: "bad" } });
    });

    it("sends to named port alongside builtin ports", async () => {
      const Node = defineIONode({
        type: "named-with-builtin-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        async input() {
          this.sendToPort("success", { payload: "ok" });
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: true, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent.length).toBeGreaterThanOrEqual(1);
      // Named port "success" → index 0
      const successSend = sent[0] as unknown as any[];
      expect(successSend[0]).toEqual({ payload: "ok" });
    });

    it("ignores unknown named port", async () => {
      const Node = defineIONode({
        type: "named-unknown-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        async input() {
          this.sendToPort("nonexistent" as any, { payload: "test" });
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(0);
    });

    it("sends by numeric index with record schema", async () => {
      const Node = defineIONode({
        type: "named-numeric-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        async input() {
          this.sendToPort(0, { payload: "by-index" });
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      expect((sent[0] as unknown as any[])[0]).toEqual({ payload: "by-index" });
    });
  });

  describe("send() with record schema validation", () => {
    it("validates per-port when validateOutput is enabled", async () => {
      const Node = defineIONode({
        type: "named-validate-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        validateOutput: true,
        async input() {
          this.send([{ payload: "valid" }, null] as any);
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
    });

    it("skips null ports during record validation", async () => {
      const Node = defineIONode({
        type: "named-validate-null-test",
        configSchema: ConfigSchema,
        outputsSchema: { success: SuccessSchema, failure: FailureSchema },
        validateOutput: true,
        async input() {
          this.send([null, { payload: { reason: "test" } }] as any);
        },
      });

      const { node } = await createNode(Node, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
    });
  });
});
