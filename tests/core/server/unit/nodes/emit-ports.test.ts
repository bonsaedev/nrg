import { describe, it, expect, vi } from "vitest";
import { createNode } from "@/test/server/unit";
import { defineIONode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/server/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-test:config" },
);

const TestNode = defineIONode({
  type: "emit-test",
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  configSchema: ConfigSchema,

  async input(msg) {
    const payload = (msg as Record<string, unknown>).payload;
    if (payload === "error") {
      throw new Error("Test error");
    }
    if (payload === "explicit-error") {
      this.error("Explicit error", msg);
      return;
    }
    if (payload === "status") {
      this.status({ fill: "green", shape: "dot", text: "ok" });
      return;
    }
    this.send(msg);
  },
});

describe("emit ports", () => {
  describe("port index calculation", () => {
    it("has only base output when all built-in port flags are false", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: false,
        },
      });

      expect(node.baseOutputs).toBe(1);
      expect(node.totalOutputs).toBe(1);
    });

    it("adds one port when error is enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: true,
          completePort: false,
          statusPort: false,
        },
      });

      expect(node.totalOutputs).toBe(2);
    });

    it("adds three ports when all built-in port flags are enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: true,
          completePort: true,
          statusPort: true,
        },
      });

      expect(node.totalOutputs).toBe(4);
    });

    it("adds two ports when only complete and status are enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: true,
          statusPort: true,
        },
      });

      expect(node.totalOutputs).toBe(3);
    });
  });

  describe("error port", () => {
    it("sends exactly one message to error port on explicit error() call", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: true,
          completePort: false,
          statusPort: false,
        },
      });

      await node.receive({ payload: "explicit-error" });

      const sent = node.sent();
      const errorSends = sent.filter(
        (s: any) => Array.isArray(s) && s[1]?.error,
      );
      expect(errorSends).toHaveLength(1);
      expect(errorSends[0][1].error.message).toBe("Explicit error");
      // Port 0 (data) should be empty (sparse array slot)
      expect(errorSends[0][0]).toBeUndefined();
    });

    it("does not send to error port when disabled but still logs error", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: false,
        },
      });

      await node.receive({ payload: "explicit-error" });

      const sent = node.sent();
      const errorSends = sent.filter(
        (s: any) => Array.isArray(s) && s.some((m: any) => m?.error),
      );
      expect(errorSends).toHaveLength(0);
      // Error should still be logged through the normal error() path
      expect(
        node.errored().some((e: string) => e.includes("Explicit error")),
      ).toBe(true);
    });
  });

  describe("status port", () => {
    it("sends exactly one message to status port on status() call", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: true,
        },
      });

      await node.receive({ payload: "status" });

      const sent = node.sent();
      const statusSends = sent.filter(
        (s: any) => Array.isArray(s) && s[1]?.status && s[1]?.source,
      );
      expect(statusSends).toHaveLength(1);
      expect(statusSends[0][1].status.fill).toBe("green");
      expect(statusSends[0][1].status.text).toBe("ok");
      expect(statusSends[0][1].source.type).toBe("emit-test");
      // Port 0 (data) should be empty (sparse array slot)
      expect(statusSends[0][0]).toBeUndefined();
    });

    it("does not send to status port when disabled but still updates UI status", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: false,
        },
      });

      await node.receive({ payload: "status" });

      const sent = node.sent();
      const statusSends = sent.filter(
        (s: any) => Array.isArray(s) && s.some((m: any) => m?.status),
      );
      expect(statusSends).toHaveLength(0);
      // Status should still be set on the node (UI update)
      const statuses = node.statuses();
      expect(statuses.some((s: any) => s.text === "ok")).toBe(true);
    });
  });

  describe("error port details", () => {
    it("includes source metadata in error message", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: true,
          completePort: false,
          statusPort: false,
        },
      });

      await node.receive({ payload: "explicit-error" });

      const sent = node.sent();
      const errorSend = sent.find((s: any) => Array.isArray(s) && s[1]?.error);
      expect(errorSend![1].error.source).toEqual({
        id: expect.any(String),
        type: "emit-test",
        name: expect.any(String),
      });
    });

    it("does not send to error port when msg is not provided", async () => {
      const NodeWithLogError = defineIONode({
        type: "log-error-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input() {
          // error() without msg — should not send to error port
          this.error("Log only error");
        },
      });

      const { node } = await createNode(NodeWithLogError, {
        config: {
          errorPort: true,
          completePort: false,
          statusPort: false,
        },
      });

      await node.receive({ payload: "test" });

      const sent = node.sent();
      const errorSends = sent.filter(
        (s: any) => Array.isArray(s) && s.some((m: any) => m?.error),
      );
      expect(errorSends).toHaveLength(0);
    });
  });

  describe("status port details", () => {
    it("includes source metadata in status message", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: true,
        },
      });

      await node.receive({ payload: "status" });

      const sent = node.sent();
      const statusSend = sent.find(
        (s: any) => Array.isArray(s) && s[1]?.status && s[1]?.source,
      );
      expect(statusSend).toBeDefined();
      expect(statusSend![1].source).toEqual({
        id: expect.any(String),
        type: "emit-test",
        name: expect.any(String),
      });
    });

    it("emits multiple messages for multiple status calls", async () => {
      const MultiStatusNode = defineIONode({
        type: "multi-status-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input() {
          this.status({ fill: "green", shape: "dot", text: "step 1" });
          this.status({ fill: "green", shape: "dot", text: "step 2" });
          this.status({ fill: "green", shape: "dot", text: "step 3" });
        },
      });

      const { node } = await createNode(MultiStatusNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: true,
        },
      });

      await node.receive({ payload: "go" });

      const sent = node.sent();
      const statusSends = sent.filter(
        (s: any) => Array.isArray(s) && s.some((m: any) => m?.status),
      );
      expect(statusSends).toHaveLength(3);
      expect(statusSends[0][1].status.text).toBe("step 1");
      expect(statusSends[1][1].status.text).toBe("step 2");
      expect(statusSends[2][1].status.text).toBe("step 3");
    });
  });

  describe("only status port enabled", () => {
    it("adds one port when only status is enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: true,
        },
      });

      expect(node.totalOutputs).toBe(2);
    });
  });

  describe("only complete port enabled", () => {
    it("adds one port when only complete is enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          errorPort: false,
          completePort: true,
          statusPort: false,
        },
      });

      expect(node.totalOutputs).toBe(2);
    });
  });

  describe("sendToPort", () => {
    it.each(["error", "complete", "status"])(
      "throws when called with built-in port '%s'",
      async (port) => {
        const GuardNode = defineIONode({
          type: `sendtoport-guard-${port}-test`,
          inputSchema: SchemaType.Object({}),
          outputsSchema: SchemaType.Object({}),
          configSchema: ConfigSchema,
          async input() {
            (this as any).sendToPort(port, { payload: "test" });
          },
        });

        const { node } = await createNode(GuardNode, {
          config: {
            errorPort: true,
            completePort: true,
            statusPort: true,
          },
        });

        await expect(node.receive({ payload: "go" })).rejects.toThrow(
          `sendToPort("${port}") is not allowed`,
        );
      },
    );

    it("sends to a numeric port index", async () => {
      const SendToPortNode = defineIONode({
        type: "sendtoport-numeric-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input(msg) {
          this.sendToPort(0, { ...msg, payload: "record" });
        },
      });

      const { node } = await createNode(SendToPortNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: false,
        },
      });

      await node.receive({ payload: "go" });

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      expect((sent[0] as unknown[])[0]).toEqual(
        expect.objectContaining({ payload: "record" }),
      );
    });

    it("sends to status port via status() method", async () => {
      const SendToPortNode = defineIONode({
        type: "sendtoport-status-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input() {
          this.status({ fill: "green", shape: "dot", text: "working" });
        },
      });

      const { node } = await createNode(SendToPortNode, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: true,
        },
      });

      await node.receive({ payload: "go" });

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      const statusSend = sent[0] as unknown[];
      expect(statusSend[1]).toEqual(
        expect.objectContaining({
          status: expect.objectContaining({ text: "working" }),
          source: expect.anything(),
        }),
      );
    });
  });

  describe("send() truncation", () => {
    it("truncates array to baseOutputs so built-in port slots are unreachable", async () => {
      const TruncateNode = defineIONode({
        type: "truncate-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input() {
          (this as any).send([
            { payload: "data" },
            { payload: "should-be-dropped" },
            { payload: "also-dropped" },
          ]);
        },
      });

      const { node } = await createNode(TruncateNode, {
        config: {
          errorPort: true,
          completePort: true,
          statusPort: true,
        },
      });

      await node.receive({ payload: "go" });

      const sent = node.sent();
      const dataSends = sent.filter(
        (s) =>
          !Array.isArray(s) ||
          !s.some(
            (m) =>
              (m as Record<string, unknown>)?.error ||
              (m as Record<string, unknown>)?.complete ||
              (m as Record<string, unknown>)?.status,
          ),
      );
      expect(dataSends.length).toBeGreaterThan(0);
      for (const s of dataSends) {
        if (Array.isArray(s)) {
          expect(s).toHaveLength(1);
          expect(s[0]).toEqual(expect.objectContaining({ payload: "data" }));
        }
      }
    });
  });

  describe("no built-in port flags in schema", () => {
    const SimpleNode = defineIONode({
      type: "simple-test",
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      async input(msg) {
        this.send(msg);
      },
    });

    it("works normally without built-in port flags", async () => {
      const { node } = await createNode(SimpleNode, {});

      await node.receive({ payload: "hello" });

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual(expect.objectContaining({ payload: "hello" }));
    });
  });
});
