import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { defineIONode, defineConfigNode } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import { createNode } from "@/sdk/test/server/unit";

// The nodes under test are TYPES-ONLY (no inputSchema/outputsSchema); their port
// topology lives only in their generics. In un-built source there is no
// `__nrgPorts` static, so without the harness's build-equivalent injection a node
// would report 0 outputs (and a multi-output node's ports would collapse). Point
// the extractor at the fixture tree so `createNode` stamps the real topology —
// the same way `port-topology-injection.test.ts` does.
import TestConfigNode from "./fixtures/helpers-test/test-config";
import TestIONode from "./fixtures/helpers-test/test-io";
import TestSplitter from "./fixtures/helpers-test/test-splitter";
import TestBroadcaster from "./fixtures/helpers-test/test-broadcaster";
import TestCredNode from "./fixtures/helpers-test/test-cred";
import TestErrorNode from "./fixtures/helpers-test/test-error";
import TestContextNode from "./fixtures/helpers-test/test-context";
import TestI18nNode from "./fixtures/helpers-test/test-i18n";
import TestSettingsNode from "./fixtures/helpers-test/test-settings";
import FactoryIONode from "./fixtures/helpers-test/factory-io";

const FIXTURE_DIR = fileURLToPath(
  new URL("./fixtures/helpers-test", import.meta.url),
);

let prevSrc: string | undefined;

beforeAll(() => {
  prevSrc = process.env.NRG_SERVER_SRC;
  process.env.NRG_SERVER_SRC = FIXTURE_DIR;
});

afterAll(() => {
  if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
  else process.env.NRG_SERVER_SRC = prevSrc;
});

// --- Inline fixtures: no ports, no removed statics — nothing to type-extract. ---

const FactoryConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "factory-config" }),
    url: SchemaType.String({ default: "https://example.com" }),
  },
  { $id: "test-helpers:factory-config" },
);

const FactoryConfigNode = defineConfigNode({
  type: "factory-config",
  configSchema: FactoryConfigSchema,

  created() {
    this.log("factory config created");
  },
});

// --- Tests ---

describe("createNode", () => {
  it("should create an IONode instance", async () => {
    const { node } = await createNode(TestIONode);
    expect(node).toBeDefined();
    expect(node.config.greeting).toBe("hello");
  });

  it("should merge user config with schema defaults", async () => {
    const { node } = await createNode(TestIONode, {
      config: { greeting: "hi" },
    });
    expect(node.config.greeting).toBe("hi");
    expect(node.config.name).toBe("test-io");
  });

  it("should call registered() automatically", async () => {
    TestIONode.registeredCalled = false;
    const { RED } = await createNode(TestIONode);
    expect(TestIONode.registeredCalled).toBe(true);
    expect(RED.log.info).toHaveBeenCalledWith("test-io registered");
  });

  it("should call created() automatically", async () => {
    const { node } = await createNode(TestIONode);
    expect(node.logged("info")).toContain("io node created");
  });

  it("should capture sent messages", async () => {
    const { node } = await createNode(TestIONode);
    await node.receive({ payload: "world" });

    expect(node.sent()).toHaveLength(1);
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "hello world" },
    ]);
  });

  it("should capture status calls", async () => {
    const { node } = await createNode(TestIONode);
    await node.receive({ payload: "test" });

    expect(node.statuses()).toHaveLength(1);
    expect(node.statuses()[0]).toEqual({ fill: "green", text: "ok" });
  });

  it("should capture log messages", async () => {
    const { node } = await createNode(TestIONode);
    expect(node.logged("info")).toContain("io node created");
  });

  it("should support closed lifecycle", async () => {
    const { node } = await createNode(TestIONode);
    await node.close();
    expect(node.logged("info")).toContain("io node closed");
  });

  it("should track warned and errored messages", async () => {
    const { node } = await createNode(TestIONode);
    node.warn("test warning");
    node.error("test error");
    expect(node.warned()).toContain("test warning");
    expect(node.errored()).toContain("test error");
  });

  it("should reset captured state", async () => {
    const { node } = await createNode(TestIONode);
    await node.receive({ payload: "a" });
    expect(node.sent()).toHaveLength(1);
    expect(node.statuses()).toHaveLength(1);

    node.reset();

    expect(node.sent()).toHaveLength(0);
    expect(node.statuses()).toHaveLength(0);
    expect(node.logged()).toHaveLength(0);

    await node.receive({ payload: "b" });
    expect(node.sent()).toHaveLength(1);
    expect(node.sent(0).map((m) => m.output)).toEqual([{ payload: "hello b" }]);
  });
});

describe("createNode (ConfigNode)", () => {
  it("should create a ConfigNode instance", async () => {
    const { node } = await createNode(TestConfigNode);
    expect(node).toBeDefined();
    expect(node.config.host).toBe("localhost");
    expect(node.config.port).toBe(8080);
  });

  it("should merge user config with defaults", async () => {
    const { node } = await createNode(TestConfigNode, {
      config: { host: "example.com" },
    });
    expect(node.config.host).toBe("example.com");
    expect(node.config.port).toBe(8080);
  });

  it("should call created() automatically", async () => {
    const { node } = await createNode(TestConfigNode);
    expect(node.logged("info")).toContain("config node created");
  });
});

describe("integration: IONode with ConfigNode reference", () => {
  it("should resolve config node references passed directly in config", async () => {
    const { node: configNode } = await createNode(TestConfigNode, {
      config: { host: "myserver.com", port: 3000 },
      overrides: { id: "config-1" },
    });

    const { node } = await createNode(TestIONode, {
      config: { server: configNode },
    });

    const resolved = node.config.server;
    expect(resolved).toBeDefined();
    expect(resolved.config.host).toBe("myserver.com");
    expect(resolved.config.port).toBe(3000);
  });
});

describe("node.receive", () => {
  it("should process input and capture output", async () => {
    const { node } = await createNode(TestIONode, {
      config: { greeting: "hey" },
    });

    await node.receive({ payload: "there" });
    expect(node.sent().map((m) => m[0].output)).toEqual([
      { payload: "hey there" },
    ]);
  });

  it("should handle multiple messages", async () => {
    const { node } = await createNode(TestIONode);

    await node.receive({ payload: "a" });
    await node.receive({ payload: "b" });

    expect(node.sent()).toHaveLength(2);
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "hello a" },
      { payload: "hello b" },
    ]);
  });

  it("should support multi-output nodes with sent(port)", async () => {
    const { node } = await createNode(TestSplitter, {
      config: { threshold: 50 },
    });

    await node.receive({ payload: 75 });
    await node.receive({ payload: 30 });

    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: 75, label: "above" },
    ]);
    expect(node.sent(1).map((m) => m.output)).toEqual([
      { payload: 30, label: "below" },
    ]);
  });

  it("should return empty array for port with no messages", async () => {
    const { node } = await createNode(TestSplitter);

    await node.receive({ payload: 75 });

    expect(node.sent(0)).toHaveLength(1);
    expect(node.sent(1)).toHaveLength(0);
  });

  it("should capture messages sent to all ports at once", async () => {
    const { node } = await createNode(TestBroadcaster);

    await node.receive({ payload: "hello" });

    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "hello", port: 0 },
    ]);
    expect(node.sent(1).map((m) => m.output)).toEqual([
      { payload: "hello", port: 1 },
    ]);
  });
});

describe("node.close", () => {
  it("should call closed hook", async () => {
    const { node } = await createNode(TestIONode);
    await node.close();
    expect(node.logged("info")).toContain("io node closed");
  });

  it("should pass removed flag", async () => {
    const { node } = await createNode(TestIONode);
    await node.close(true);
    expect(node.logged("info")).toContain("io node closed");
  });
});

describe("credentials", () => {
  it("should pass credentials to the node", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "payload", type: "msg" } },
      credentials: { apiKey: "secret-123" },
    });

    await node.receive({ payload: "test" });
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "test", auth: "secret-123" },
    ]);
  });

  it("should handle missing credentials", async () => {
    const { node } = await createNode(TestCredNode);

    await node.receive({ payload: "test" });
    expect(node.sent()).toHaveLength(0);
    expect(node.warned()).toContain("no api key");
  });
});

describe("TypedInput resolution", () => {
  it("should resolve msg property via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "payload", type: "msg" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({ payload: "from-msg" });
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "from-msg", auth: "key" },
    ]);
  });

  it("should resolve string literal via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "hello", type: "str" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({});
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "hello", auth: "key" },
    ]);
  });

  it("should resolve number via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "42", type: "num" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({});
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: 42, auth: "key" },
    ]);
  });
});

describe("error handling", () => {
  it("should not crash when input throws", async () => {
    const { node } = await createNode(TestErrorNode);

    await expect(node.receive({ payload: "test" })).rejects.toThrow(
      "something broke",
    );
    expect(node.sent()).toHaveLength(0);
    expect(node.errored().length).toBeGreaterThan(0);
    expect(node.errored().some((msg) => msg.includes("something broke"))).toBe(
      true,
    );
  });
});

describe("context store", () => {
  it("should support node context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({});
    await node.receive({});

    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: 1 },
      { payload: 2 },
    ]);
  });

  it("should support flow context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({ scope: "flow" });

    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "flow-value" },
    ]);
  });

  it("should support global context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({ scope: "global" });

    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "global-value" },
    ]);
  });
});

describe("i18n", () => {
  it("should resolve i18n keys via RED._", async () => {
    const { node } = await createNode(TestI18nNode);

    await node.receive({});

    // RED._ mock returns the key prefixed with node type
    expect(node.sent(0).map((m) => m.output)).toEqual([
      { payload: "test-i18n.greeting" },
    ]);
  });

  it("should support __placeholder__ substitutions by default", async () => {
    const { node } = await createNode(TestI18nNode);

    // RED._ mock handles __key__ substitutions automatically.
    // The key is returned with substitutions applied.
    const result = node.i18n("hello __name__", { name: "world" });
    expect(result).toBe("test-i18n.hello world");
  });
});

describe("factory API (defineIONode / defineConfigNode)", () => {
  it("should work with defineIONode", async () => {
    const { node } = await createNode(FactoryIONode);

    expect(node.logged("info")).toContain("factory io created");
    await node.receive({ payload: "hello" });
    expect(node.sent(0).map((m) => m.output)).toEqual([{ payload: "> hello" }]);
  });

  it("should work with defineConfigNode", async () => {
    const { node } = await createNode(FactoryConfigNode);

    expect(node.logged("info")).toContain("factory config created");
    expect(node.config.url).toBe("https://example.com");
  });

  it("should support config overrides with factory nodes", async () => {
    const { node } = await createNode(FactoryIONode, {
      config: { prefix: ">>" },
    });

    await node.receive({ payload: "test" });
    expect(node.sent(0).map((m) => m.output)).toEqual([{ payload: ">> test" }]);
  });
});

describe("settings", () => {
  it("should resolve settings from RED.settings", async () => {
    const { node } = await createNode(TestSettingsNode, {
      settings: { testSettingsTimeout: 3000 },
    });

    await node.receive({});
    expect(node.sent(0).map((m) => m.output)).toEqual([{ payload: 3000 }]);
  });

  it("should use default settings when not provided", async () => {
    const { node } = await createNode(TestSettingsNode);

    await node.receive({});
    expect(node.sent(0).map((m) => m.output)).toEqual([{ payload: 5000 }]);
  });

  describe("created() failure semantics", () => {
    it("does NOT reject when created() throws; exposes it as the result error", async () => {
      const boom = new Error("created boom");
      const Failing = defineIONode({
        type: "created-fails",
        async created() {
          throw boom;
        },
      });

      // Production constructs the node regardless (it surfaces the error on the
      // first input via done); createNode mirrors that — it resolves, not rejects.
      const { node, error } = await createNode(Failing);
      expect(node).toBeDefined();
      expect(error).toBe(boom);
    });

    it("result error is undefined when created() succeeds", async () => {
      const Ok = defineIONode({
        type: "created-ok",
        async created() {
          /* no-op */
        },
      });
      const { error } = await createNode(Ok);
      expect(error).toBeUndefined();
    });
  });
});
