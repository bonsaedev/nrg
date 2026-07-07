import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";
import NamedTwoPorts from "../fixtures/named-ports-test/named-two-ports";
import NamedSinglePort from "../fixtures/named-ports-test/named-single-port";
import NamedEmitSuccess from "../fixtures/named-ports-test/named-emit-success";
import NamedEmitFailure from "../fixtures/named-ports-test/named-emit-failure";
import NamedEmitIndex from "../fixtures/named-ports-test/named-emit-index";
import NamedEmitOob from "../fixtures/named-ports-test/named-emit-oob";
import NamedEmitArray from "../fixtures/named-ports-test/named-emit-array";
import NamedEmitArrayNull from "../fixtures/named-ports-test/named-emit-array-null";

// The fixture nodes are TYPES-ONLY: their port topology (count + named-port
// names) lives only in their `Output` generics (a `Port<T>` record, a single
// object, or a positional tuple) — there is no outputsSchema. Point the topology
// extractor at the fixture tree so `createNode` stamps `__nrgPorts` exactly as
// the build would, and named/positional ports resolve like a built node's.
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/named-ports-test", import.meta.url),
);

// JSON-Schema strings a flow author would set in the editor. Data validation is
// config-schema-driven now (no static output schemas): a port validates when its
// `validateOutputs[index]` flag is on and `outputSchemas[index]` supplies a
// schema.
const successJSON = JSON.stringify({
  type: "object",
  properties: { payload: { type: "string" } },
  required: ["payload"],
});
const failureJSON = JSON.stringify({
  type: "object",
  properties: {
    payload: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  required: ["payload"],
});

describe("named output ports", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  describe("outputs count", () => {
    it("counts named-port record keys as output ports", async () => {
      const { node } = await createNode(NamedTwoPorts, {});
      expect(node.baseOutputs).toBe(2);
    });

    it("counts a single object output as one output", async () => {
      const { node } = await createNode(NamedSinglePort, {});
      expect(node.baseOutputs).toBe(1);
    });
  });

  describe("sendToPort with named ports", () => {
    it("sends to named port by string", async () => {
      const { node } = await createNode(NamedEmitSuccess, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      expect(node.sent("success")).toEqual([{ output: { payload: "ok" } }]);
      expect(node.sent("failure")).toEqual([]);
    });

    it("sends to second named port", async () => {
      const { node } = await createNode(NamedEmitFailure, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      expect(node.sent("success")).toEqual([]);
      expect(node.sent("failure")).toEqual([
        { output: { payload: { reason: "bad" } } },
      ]);
    });

    it("sends to named port alongside builtin ports", async () => {
      const { node } = await createNode(NamedEmitSuccess, {
        config: { errorPort: true, completePort: false, statusPort: false },
      });

      await node.receive({});

      expect(node.sent("success")).toEqual([{ output: { payload: "ok" } }]);
    });

    it("throws for an unknown named port instead of silently dropping", async () => {
      const { node } = await createNode(NamedTwoPorts, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      // The type gate (OutputPortNames) is compile-time only; a JS author
      // reaching a stale name (here via an `as` bypass) must fail loudly,
      // not vanish.
      expect(() =>
        (node as { sendToPort: (p: string, m: unknown) => void }).sendToPort(
          "nonexistent",
          { payload: "test" },
        ),
      ).toThrow(/unknown output port/i);
      expect(node.sent()).toHaveLength(0);
    });

    it("throws when the node has no named ports (single/absent output)", async () => {
      const { node } = await createNode(NamedSinglePort, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      expect(() =>
        (node as { sendToPort: (p: string, m: unknown) => void }).sendToPort(
          "success",
          { payload: "x" },
        ),
      ).toThrow(/no named output ports/i);
    });

    it("numeric index beyond baseOutputs creates sparse send", async () => {
      const { node } = await createNode(NamedEmitOob, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      expect(node.sent(5)).toEqual([{ output: { payload: "oob" } }]);
      expect(node.sent(0)).toEqual([]);
    });

    it("sends by numeric index with a named-port node", async () => {
      const { node } = await createNode(NamedEmitIndex, {
        config: { errorPort: false, completePort: false, statusPort: false },
      });

      await node.receive({});

      expect(node.sent(0)).toEqual([{ output: { payload: "by-index" } }]);
    });
  });

  describe("send() with per-port output validation", () => {
    it("validates per-port when validateOutputs is enabled", async () => {
      const { node } = await createNode(NamedEmitArray, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: false,
          validateOutputs: { 0: true, 1: true },
          outputSchemas: { 0: successJSON, 1: failureJSON },
        },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
    });

    it("skips null ports during per-port validation", async () => {
      const { node } = await createNode(NamedEmitArrayNull, {
        config: {
          errorPort: false,
          completePort: false,
          statusPort: false,
          validateOutputs: { 0: true, 1: true },
          outputSchemas: { 0: successJSON, 1: failureJSON },
        },
      });

      await node.receive({});

      const sent = node.sent();
      expect(sent).toHaveLength(1);
    });
  });
});
