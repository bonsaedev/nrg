import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";
import EmitTest from "../fixtures/emit-ports-test/emit-test";
import LogErrorTest from "../fixtures/emit-ports-test/log-error-test";
import MultiStatusTest from "../fixtures/emit-ports-test/multi-status-test";
import SendToPortGuardError from "../fixtures/emit-ports-test/sendtoport-guard-error-test";
import SendToPortGuardComplete from "../fixtures/emit-ports-test/sendtoport-guard-complete-test";
import SendToPortGuardStatus from "../fixtures/emit-ports-test/sendtoport-guard-status-test";
import SendToPortNumeric from "../fixtures/emit-ports-test/sendtoport-numeric-test";
import SendToPortStatus from "../fixtures/emit-ports-test/sendtoport-status-test";
import TruncateTest from "../fixtures/emit-ports-test/truncate-test";
import SimpleTest from "../fixtures/emit-ports-test/simple-test";
import ReturnComplete from "../fixtures/emit-ports-test/return-complete-test";
import VoidComplete from "../fixtures/emit-ports-test/void-complete-test";

// The fixture nodes are TYPES-ONLY (no inputSchema/outputsSchema); their port
// topology lives only in their generics. Point the extractor at the fixture tree
// so createNode stamps the same `__nrgPorts` the production build would inject —
// otherwise a types-only node reports 0 ports and its built-in error/complete/
// status ports collapse onto the data-port index.
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/emit-ports-test", import.meta.url),
);

const guardNodes = {
  error: SendToPortGuardError,
  complete: SendToPortGuardComplete,
  status: SendToPortGuardStatus,
} as const;

describe("emit ports", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  describe("port index calculation", () => {
    it("has only base output when all built-in port flags are false", async () => {
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
        config: {
          errorPort: true,
          completePort: false,
          statusPort: false,
        },
      });

      expect(node.totalOutputs).toBe(2);
    });

    it("adds three ports when all built-in port flags are enabled", async () => {
      const { node } = await createNode(EmitTest, {
        config: {
          errorPort: true,
          completePort: true,
          statusPort: true,
        },
      });

      expect(node.totalOutputs).toBe(4);
    });

    it("adds two ports when only complete and status are enabled", async () => {
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(LogErrorTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(MultiStatusTest, {
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
      const { node } = await createNode(EmitTest, {
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
      const { node } = await createNode(EmitTest, {
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
    it.each(["error", "complete", "status"] as const)(
      "throws when called with built-in port '%s'",
      async (port) => {
        const { node } = await createNode(guardNodes[port], {
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
      const { node } = await createNode(SendToPortNumeric, {
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
      const { node } = await createNode(SendToPortStatus, {
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
      const { node } = await createNode(TruncateTest, {
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
    it("works normally without built-in port flags", async () => {
      const { node } = await createNode(SimpleTest, {});

      await node.receive({ payload: "hello" });

      const sent = node.sent();
      expect(sent).toHaveLength(1);
      expect(sent[0][0]).toEqual(expect.objectContaining({ payload: "hello" }));
    });
  });

  describe("input() return value on the complete port", () => {
    it("rides the complete port under output when input() returns a value", async () => {
      const { node } = await createNode(ReturnComplete, {
        config: { completePort: true },
      });
      await node.receive({ payload: "go" });

      const completeMsg = node.sent("complete")[0];
      expect(completeMsg.output).toEqual({ sum: 42 });
      expect(completeMsg.complete.source.type).toBe("return-complete-test");
    });

    it("keeps the plain completion signal (no output) when input() returns nothing", async () => {
      const { node } = await createNode(VoidComplete, {
        config: { completePort: true },
      });
      await node.receive({ payload: "go" });

      const completeMsg = node.sent("complete")[0];
      expect(completeMsg.complete).toBeDefined();
      expect(completeMsg.output).toBeUndefined();
    });
  });
});
