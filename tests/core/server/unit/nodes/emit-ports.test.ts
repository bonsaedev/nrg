import { describe, it, expect, vi } from "vitest";
import { createNode } from "@/sdk/test/server/unit";
import { defineIONode } from "@/sdk/lib/server/nodes";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-test:config" },
);

// A custom Error subclass carrying extra data, as a node author would build.
class CustomError extends Error {
  code: string;
  retryable: boolean;
  detail: { attempt: number };
  constructor(message: string) {
    super(message);
    this.name = "CustomError";
    this.code = "E_CUSTOM";
    this.retryable = true;
    this.detail = { attempt: 2 };
  }
}

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
    if (payload === "custom-error") {
      throw new CustomError("Custom failure");
    }
    if (payload === "throw-primitive") {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "boom";
    }
    if (payload === "explicit-error") {
      this.error("Explicit error", msg);
      return;
    }
    if (payload === "error-then-throw") {
      // A node that logs/routes the error via error(msg) AND then throws must
      // still produce exactly ONE error-port message (not two).
      this.error("Logged then threw", msg);
      throw new Error("Logged then threw");
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

  describe("sent() built-in port resolution", () => {
    it("resolves error/complete/status slots with all built-in ports enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: { errorPort: true, completePort: true, statusPort: true },
      });

      await node.receive({ payload: "status" });

      // base=1 → error@1, complete@2, status@3. A successful run auto-emits to
      // the complete port; "status" emits to the status port; no error.
      expect(node.sent("error")).toHaveLength(0);
      expect(node.sent("complete")).toHaveLength(1);
      expect(node.sent("status")).toHaveLength(1);
      expect(node.sent("status")[0].status.text).toBe("ok");
    });

    it("returns [] for a built-in port that is disabled", async () => {
      const { node } = await createNode(TestNode, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({ payload: "status" });

      expect(node.sent("complete")).toHaveLength(0);
      expect(node.sent("error")).toHaveLength(0);
      expect(node.sent("status")).toHaveLength(0);
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

      const errorSends = node.sent("error");
      expect(errorSends).toHaveLength(1);
      expect(errorSends[0].error.message).toBe("Explicit error");
      // The error payload carries `name` (Catch-node compatible).
      expect(errorSends[0].error.name).toBe("Error");
      // The data port received nothing.
      expect(node.sent(0)).toHaveLength(0);
    });

    it("emits exactly one error-port message (with name) when error(msg) is called AND the call throws", async () => {
      const { node } = await createNode(TestNode, {
        config: { errorPort: true, completePort: false, statusPort: false },
      });

      await expect(
        node.receive({ payload: "error-then-throw" }),
      ).rejects.toThrow("Logged then threw");

      const errorSends = node.sent("error");
      // Deduped: error(msg) emitted, so the input-handler catch did NOT re-emit.
      expect(errorSends).toHaveLength(1);
      expect(errorSends[0].error.name).toBe("Error");
      expect(errorSends[0].error.message).toBe("Logged then threw");
    });

    it("carries a thrown custom error's own properties under msg.error", async () => {
      const { node } = await createNode(TestNode, {
        config: { errorPort: true, completePort: false, statusPort: false },
      });

      await expect(node.receive({ payload: "custom-error" })).rejects.toThrow();

      const errorSends = node.sent("error");
      expect(errorSends).toHaveLength(1);
      const error = errorSends[0].error;
      // Author's custom fields ride along, plus canonical name/message/source.
      expect(error).toMatchObject({
        name: "CustomError",
        message: "Custom failure",
        code: "E_CUSTOM",
        retryable: true,
        detail: { attempt: 2 },
      });
      expect(error.source).toMatchObject({ type: "emit-test" });
    });

    it("falls back to name 'Error' and a generic message for a non-Error throw", async () => {
      const { node } = await createNode(TestNode, {
        config: { errorPort: true, completePort: false, statusPort: false },
      });

      await expect(
        node.receive({ payload: "throw-primitive" }),
      ).rejects.toThrow();

      const errorSends = node.sent("error");
      expect(errorSends).toHaveLength(1);
      expect(errorSends[0].error).toMatchObject({
        name: "Error",
        message: "Unknown error during input handling",
      });
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

      expect(node.sent("error")).toHaveLength(0);
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

      const statusSends = node.sent("status");
      expect(statusSends).toHaveLength(1);
      expect(statusSends[0].status.fill).toBe("green");
      expect(statusSends[0].status.text).toBe("ok");
      expect(statusSends[0].source.type).toBe("emit-test");
      // The data port received nothing.
      expect(node.sent(0)).toHaveLength(0);
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

      expect(node.sent("status")).toHaveLength(0);
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

      const errorSend = node.sent("error")[0];
      expect(errorSend.error.source).toEqual({
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

      expect(node.sent("error")).toHaveLength(0);
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

      const statusSend = node.sent("status")[0];
      expect(statusSend).toBeDefined();
      expect(statusSend.source).toEqual({
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

      const statusSends = node.sent("status");
      expect(statusSends).toHaveLength(3);
      expect(statusSends[0].status.text).toBe("step 1");
      expect(statusSends[1].status.text).toBe("step 2");
      expect(statusSends[2].status.text).toBe("step 3");
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

      const statusSend = node.sent("status")[0];
      expect(statusSend).toEqual(
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

      const completeMsg = node.sent("complete")[0];
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

      const completeMsg = node.sent("complete")[0];
      expect(completeMsg.complete).toBeDefined();
      expect(completeMsg.output).toBeUndefined();
    });
  });
});
