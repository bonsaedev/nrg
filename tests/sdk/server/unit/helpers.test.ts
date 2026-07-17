import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { IONode, Meta } from "@/sdk/lib/server";
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
    // The frame IS the flow's accumulating record: the sent fields sit at the
    // TOP level (no `output` envelope), and the provenance rides the typed
    // `[Meta]` accessor — not a root `source` key.
    const frame = node.sent("out")[0];
    expect(frame.payload).toBe("hello world");
    expect(frame[Meta].source).toMatchObject({
      type: "test-io",
      port: 0,
      portName: "out",
    });
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
    expect(node.sent("out").map((m) => m.payload)).toEqual(["hello b"]);
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
    // Positional access: `sent()[i][j]` is port j of emission i — the frame is
    // the record itself, so the sent field reads at the top level.
    expect(node.sent().map((m) => m[0].payload)).toEqual(["hey there"]);
  });

  it("should handle multiple messages", async () => {
    const { node } = await createNode(TestIONode);

    await node.receive({ payload: "a" });
    await node.receive({ payload: "b" });

    expect(node.sent()).toHaveLength(2);
    expect(node.sent("out").map((m) => m.payload)).toEqual([
      "hello a",
      "hello b",
    ]);
  });

  it("should support multi-output nodes with per-port sent()", async () => {
    const { node } = await createNode(TestSplitter, {
      config: { threshold: 50 },
    });

    await node.receive({ payload: 75 });
    await node.receive({ payload: 30 });

    // Each frame is the accumulating record: the incoming `payload` is carried
    // and the routing `label` this node adds sits beside it (`toMatchObject`
    // because the frame also carries the framework's `_meta` provenance).
    expect(node.sent("out0")).toMatchObject([{ payload: 75, label: "above" }]);
    expect(node.sent("out1")).toMatchObject([{ payload: 30, label: "below" }]);
  });

  it("should return empty array for port with no messages", async () => {
    const { node } = await createNode(TestSplitter);

    await node.receive({ payload: 75 });

    // The splitter only ever sends to the matching port — the other port sees
    // no emission at all (there is no "null slot" in the record model).
    expect(node.sent(0)).toHaveLength(1);
    expect(node.sent(1)).toHaveLength(0);
  });

  it("should capture messages sent to all ports at once", async () => {
    const { node } = await createNode(TestBroadcaster);

    await node.receive({ payload: "hello" });

    expect(node.sent("out0")).toMatchObject([{ payload: "hello", port: 0 }]);
    expect(node.sent("out1")).toMatchObject([{ payload: "hello", port: 1 }]);
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
    expect(node.sent("out")).toMatchObject([
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
    expect(node.sent("out")).toMatchObject([
      { payload: "from-msg", auth: "key" },
    ]);
  });

  it("should resolve string literal via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "hello", type: "str" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({});
    expect(node.sent("out")).toMatchObject([{ payload: "hello", auth: "key" }]);
  });

  it("should resolve number via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "42", type: "num" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({});
    expect(node.sent("out")).toMatchObject([{ payload: 42, auth: "key" }]);
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

    expect(node.sent(0).map((m) => ({ payload: m.payload }))).toEqual([
      { payload: 1 },
      { payload: 2 },
    ]);
  });

  it("should support flow context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({ scope: "flow" });

    expect(node.sent(0).map((m) => ({ payload: m.payload }))).toEqual([
      { payload: "flow-value" },
    ]);
  });

  it("should support global context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({ scope: "global" });

    expect(node.sent(0).map((m) => ({ payload: m.payload }))).toEqual([
      { payload: "global-value" },
    ]);
  });
});

describe("i18n", () => {
  it("should resolve i18n keys via RED._", async () => {
    const { node } = await createNode(TestI18nNode);

    await node.receive({});

    // RED._ mock returns the key prefixed with node type
    expect(node.sent(0).map((m) => ({ payload: m.payload }))).toEqual([
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

describe("settings", () => {
  it("should resolve settings from RED.settings", async () => {
    const { node } = await createNode(TestSettingsNode, {
      settings: { testSettingsTimeout: 3000 },
    });

    await node.receive({});
    expect(node.sent(0).map((m) => ({ payload: m.payload }))).toEqual([
      { payload: 3000 },
    ]);
  });

  it("should use default settings when not provided", async () => {
    const { node } = await createNode(TestSettingsNode);

    await node.receive({});
    expect(node.sent(0).map((m) => ({ payload: m.payload }))).toEqual([
      { payload: 5000 },
    ]);
  });

  describe("created() failure semantics", () => {
    it("does NOT reject when created() throws; exposes it as the result error", async () => {
      const boom = new Error("created boom");
      class Failing extends IONode {
        static override readonly type = "created-fails";
        override async created() {
          throw boom;
        }
      }

      // Production constructs the node regardless (it surfaces the error on the
      // first input via done); createNode mirrors that — it resolves, not rejects.
      const { node, error } = await createNode(Failing);
      expect(node).toBeDefined();
      expect(error).toBe(boom);
    });

    it("result error is undefined when created() succeeds", async () => {
      class Ok extends IONode {
        static override readonly type = "created-ok";
        override async created() {
          /* no-op */
        }
      }
      const { error } = await createNode(Ok);
      expect(error).toBeUndefined();
    });
  });
});
