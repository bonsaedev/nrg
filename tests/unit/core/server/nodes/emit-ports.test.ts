import { describe, it, expect, vi } from "vitest";
import { createNode } from "../../../../../src/test";
import { defineIONode } from "../../../../../src/core/server/nodes";
import {
  defineSchema,
  SchemaType,
} from "../../../../../src/core/server/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    emitError: SchemaType.Boolean({ default: false }),
    emitComplete: SchemaType.Boolean({ default: false }),
    emitStatus: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-test:config" },
);

const TestNode = defineIONode({
  type: "emit-test",
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  configSchema: ConfigSchema,

  async input(msg) {
    if ((msg as any).payload === "error") {
      throw new Error("Test error");
    }
    if ((msg as any).payload === "explicit-error") {
      this.error("Explicit error", msg);
      return;
    }
    if ((msg as any).payload === "status") {
      this.status({ fill: "green", shape: "dot", text: "ok" });
      return;
    }
    this.send(msg);
  },
});

describe("emit ports", () => {
  describe("port index calculation", () => {
    it("returns null for all ports when emit flags are false", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: false,
          emitComplete: false,
          emitStatus: false,
        },
      });

      expect(node._getErrorPortIndex()).toBeNull();
      expect(node._getCompletePortIndex()).toBeNull();
      expect(node._getStatusPortIndex()).toBeNull();
      expect(node._baseOutputs).toBe(1);
      expect(node._totalOutputs).toBe(1);
    });

    it("calculates error port index", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: true,
          emitComplete: false,
          emitStatus: false,
        },
      });

      expect(node._getErrorPortIndex()).toBe(1);
      expect(node._getCompletePortIndex()).toBeNull();
      expect(node._getStatusPortIndex()).toBeNull();
      expect(node._totalOutputs).toBe(2);
    });

    it("calculates all port indices correctly", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: true,
          emitComplete: true,
          emitStatus: true,
        },
      });

      expect(node._getErrorPortIndex()).toBe(1);
      expect(node._getCompletePortIndex()).toBe(2);
      expect(node._getStatusPortIndex()).toBe(3);
      expect(node._totalOutputs).toBe(4);
    });

    it("skips error port when only complete and status are enabled", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: false,
          emitComplete: true,
          emitStatus: true,
        },
      });

      expect(node._getErrorPortIndex()).toBeNull();
      expect(node._getCompletePortIndex()).toBe(1);
      expect(node._getStatusPortIndex()).toBe(2);
      expect(node._totalOutputs).toBe(3);
    });
  });

  describe("error port", () => {
    it("sends exactly one message to error port on explicit error() call", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: true,
          emitComplete: false,
          emitStatus: false,
        },
      });

      await node.receive({ payload: "explicit-error" });

      const sent = node.sent();
      const errorSends = sent.filter(
        (s: any) => Array.isArray(s) && s[1]?.error,
      );
      expect(errorSends).toHaveLength(1);
      expect(errorSends[0][1].error.message).toBe("Explicit error");
      // Port 0 (data) should be null
      expect(errorSends[0][0]).toBeNull();
    });

    it("does not send to error port when disabled but still logs error", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: false,
          emitComplete: false,
          emitStatus: false,
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
          emitError: false,
          emitComplete: false,
          emitStatus: true,
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
      // Port 0 (data) should be null
      expect(statusSends[0][0]).toBeNull();
    });

    it("does not send to status port when disabled but still updates UI status", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: false,
          emitComplete: false,
          emitStatus: false,
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
          emitError: true,
          emitComplete: false,
          emitStatus: false,
        },
      });

      await node.receive({ payload: "explicit-error" });

      const sent = node.sent();
      const errorSend = sent.find((s: any) => Array.isArray(s) && s[1]?.error);
      expect(errorSend[1].error.source).toEqual({
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
          emitError: true,
          emitComplete: false,
          emitStatus: false,
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
          emitError: false,
          emitComplete: false,
          emitStatus: true,
        },
      });

      await node.receive({ payload: "status" });

      const sent = node.sent();
      const statusSend = sent.find(
        (s: any) => Array.isArray(s) && s[1]?.status && s[1]?.source,
      );
      expect(statusSend).toBeDefined();
      expect(statusSend[1].source).toEqual({
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
          emitError: false,
          emitComplete: false,
          emitStatus: true,
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
    it("calculates status port at base index when error and complete are off", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: false,
          emitComplete: false,
          emitStatus: true,
        },
      });

      expect(node._getStatusPortIndex()).toBe(1);
      expect(node._totalOutputs).toBe(2);
    });
  });

  describe("only complete port enabled", () => {
    it("calculates complete port at base index when error is off", async () => {
      const { node } = await createNode(TestNode, {
        config: {
          emitError: false,
          emitComplete: true,
          emitStatus: false,
        },
      });

      expect(node._getCompletePortIndex()).toBe(1);
      expect(node._totalOutputs).toBe(2);
    });
  });

  describe("no emit flags in schema", () => {
    const SimpleNode = defineIONode({
      type: "simple-test",
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      async input(msg) {
        this.send(msg);
      },
    });

    it("works normally without emit flags", async () => {
      const { node } = await createNode(SimpleNode, {});

      await node.receive({ payload: "hello" });

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      expect(sent[0].payload).toBe("hello");
    });
  });
});
