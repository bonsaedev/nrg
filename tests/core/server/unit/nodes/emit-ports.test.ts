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

// Built-in lifecycle ports (error/complete/status) occupy positional slots
// beyond a node's declared output ports, so they fall outside the typed sent()
// shape. These framework tests inspect those raw slots directly.
const rawSent = (node: any): any[] => node.sent();

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

      const sent = rawSent(node);
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

      const sent = rawSent(node);
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

      const sent = rawSent(node);
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

      const sent = rawSent(node);
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

      const sent = rawSent(node);
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
        async input() {
          this.sendToPort(0, "record");
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
      // the value is wrapped under the return key; carry (the default mode)
      // spreads the incoming context but does not record lineage
      expect((sent[0] as unknown[])[0]).toEqual({
        payload: "go",
        output: "record",
      });
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
    it("truncates a send() array to baseOutputs so built-in port slots are unreachable", async () => {
      // Two base output ports, but built-in error/status ports are enabled
      // (totalOutputs is 4). Sending more values than base ports must truncate
      // to baseOutputs so a stray value can never land in an error/status slot.
      // (completePort is left off so its automatic emission doesn't add noise.)
      const TruncateNode = defineIONode({
        type: "truncate-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: [SchemaType.Object({}), SchemaType.Object({})],
        configSchema: ConfigSchema,
        async input() {
          (this as any).send([
            { payload: "port-0" },
            { payload: "port-1" },
            { payload: "should-be-dropped" },
            { payload: "also-dropped" },
          ]);
        },
      });

      const { node } = await createNode(TruncateNode, {
        config: {
          errorPort: true,
          completePort: false,
          statusPort: true,
        },
      });

      await node.receive({ payload: "go" });

      const sent = node.sent();
      expect(sent).toHaveLength(1);

      const ports = sent[0];
      // exactly baseOutputs slots — the two extra values are dropped, so they
      // cannot reach the built-in error/complete/status port slots
      expect(ports).toHaveLength(2);
      expect(ports[0]).toEqual(
        expect.objectContaining({ output: { payload: "port-0" } }),
      );
      expect(ports[1]).toEqual(
        expect.objectContaining({ output: { payload: "port-1" } }),
      );
      const leaked = ports.some((m: any) =>
        ["should-be-dropped", "also-dropped"].includes(m?.output?.payload),
      );
      expect(leaked).toBe(false);
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
      expect(sent[0][0]).toEqual(expect.objectContaining({ payload: "hello" }));
    });
  });

  describe("input() return value on the complete port", () => {
    it("rides the complete port under output when input() returns a value", async () => {
      const ReturnNode = defineIONode({
        type: "return-complete-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input() {
          return { sum: 42 };
        },
      });

      const { node } = await createNode(ReturnNode, {
        config: { completePort: true },
      });
      await node.receive({ payload: "go" });

      // baseOutputs=1, only completePort enabled → complete at index 1
      const completeMsg = rawSent(node).find(
        (s) => Array.isArray(s) && s[1]?.complete,
      )?.[1];
      expect(completeMsg.output).toEqual({ sum: 42 });
      expect(completeMsg.complete.source.type).toBe("return-complete-test");
    });

    it("keeps the plain completion signal (no output) when input() returns nothing", async () => {
      const VoidNode = defineIONode({
        type: "void-complete-test",
        inputSchema: SchemaType.Object({}),
        outputsSchema: SchemaType.Object({}),
        configSchema: ConfigSchema,
        async input() {
          // no return
        },
      });

      const { node } = await createNode(VoidNode, {
        config: { completePort: true },
      });
      await node.receive({ payload: "go" });

      const completeMsg = rawSent(node).find(
        (s) => Array.isArray(s) && s[1]?.complete,
      )?.[1];
      expect(completeMsg.complete).toBeDefined();
      expect(completeMsg.output).toBeUndefined();
    });
  });
});
