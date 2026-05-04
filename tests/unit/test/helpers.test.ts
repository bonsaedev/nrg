import { describe, it, expect } from "vitest";
import {
  IONode,
  ConfigNode,
  defineIONode,
  defineConfigNode,
  type Schema,
  type Infer,
  type RED,
} from "../../../src/core/server";
import { defineSchema, SchemaType } from "../../../src/core/server/schemas";
import { createNode } from "../../../src/test";

// --- Test fixtures ---

const TestConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "test-config" }),
    host: SchemaType.String({ default: "localhost" }),
    port: SchemaType.Number({ default: 8080 }),
  },
  { $id: "test-helpers:config" },
);

type TestConfig = Infer<typeof TestConfigSchema>;

class TestConfigNode extends ConfigNode<TestConfig> {
  static override readonly type = "test-config";
  static override readonly configSchema: Schema = TestConfigSchema;

  async created() {
    this.log("config node created");
  }
}

const TestIOSchema = defineSchema(
  {
    name: SchemaType.String({ default: "test-io" }),
    server: SchemaType.NodeRef(TestConfigNode),
    greeting: SchemaType.String({ default: "hello" }),
  },
  { $id: "test-helpers:io-config" },
);

type TestIOConfig = Infer<typeof TestIOSchema>;

class TestIONode extends IONode<TestIOConfig> {
  static override readonly type = "test-io";
  static override readonly category = "function";
  static override readonly configSchema: Schema = TestIOSchema;
  static registeredCalled = false;

  static override async registered(RED: RED) {
    TestIONode.registeredCalled = true;
    RED.log.info("test-io registered");
  }

  async created() {
    this.log("io node created");
  }

  async input(msg: any) {
    const greeting = this.config.greeting;
    this.send({ payload: `${greeting} ${msg.payload}` });
    this.status({ fill: "green", text: "ok" });
  }

  async closed() {
    this.log("io node closed");
  }
}

const SplitterSchema = defineSchema(
  {
    name: SchemaType.String({ default: "splitter" }),
    threshold: SchemaType.Number({ default: 50 }),
  },
  { $id: "test-helpers:splitter-config" },
);

class TestSplitter extends IONode {
  static override readonly type = "test-splitter";
  static override readonly category = "function";
  static override readonly outputs = 2;
  static override readonly configSchema: Schema = SplitterSchema;

  async input(msg: any) {
    if (msg.payload > this.config.threshold) {
      this.send([{ payload: msg.payload, label: "above" }, null]);
    } else {
      this.send([null, { payload: msg.payload, label: "below" }]);
    }
  }
}

class TestBroadcaster extends IONode {
  static override readonly type = "test-broadcaster";
  static override readonly category = "function";
  static override readonly outputs = 2;

  async input(msg: any) {
    this.send([
      { payload: msg.payload, port: 0 },
      { payload: msg.payload, port: 1 },
    ]);
  }
}

const CredentialNodeSchema = defineSchema(
  {
    name: SchemaType.String({ default: "cred-node" }),
    endpoint: SchemaType.TypedInput<string>(),
  },
  { $id: "test-helpers:cred-config" },
);

const CredentialSchema = defineSchema(
  {
    apiKey: SchemaType.Optional(SchemaType.String({ default: "" })),
  },
  { $id: "test-helpers:cred-creds" },
);

type CredConfig = Infer<typeof CredentialNodeSchema>;
type CredCreds = Infer<typeof CredentialSchema>;

class TestCredNode extends IONode<CredConfig, CredCreds> {
  static override readonly type = "test-cred";
  static override readonly category = "function";
  static override readonly configSchema: Schema = CredentialNodeSchema;
  static override readonly credentialsSchema: Schema = CredentialSchema;

  async input(msg: any) {
    const key = this.credentials?.apiKey;
    if (!key) {
      this.warn("no api key");
      return;
    }
    const resolved = await this.config.endpoint.resolve(msg);
    this.send({ payload: resolved, auth: key });
  }
}

class TestErrorNode extends IONode {
  static override readonly type = "test-error";
  static override readonly category = "function";

  async input(_msg: any) {
    throw new Error("something broke");
  }
}

class TestContextNode extends IONode {
  static override readonly type = "test-context";
  static override readonly category = "function";

  async created() {
    await this.context.node.set("counter", 0);
    await this.context.flow.set("sharedKey", "flow-value");
    await this.context.global.set("globalKey", "global-value");
  }

  async input(msg: any) {
    const scope = msg.scope as string;
    if (scope === "flow") {
      const val = await this.context.flow.get<string>("sharedKey");
      this.send({ payload: val });
    } else if (scope === "global") {
      const val = await this.context.global.get<string>("globalKey");
      this.send({ payload: val });
    } else {
      const count = (await this.context.node.get<number>("counter")) ?? 0;
      await this.context.node.set("counter", count + 1);
      this.send({ payload: count + 1 });
    }
  }
}

class TestI18nNode extends IONode {
  static override readonly type = "test-i18n";
  static override readonly category = "function";

  async input(_msg: any) {
    const label = this.i18n("greeting");
    this.send({ payload: label });
  }
}

// --- Factory API fixtures ---

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

const FactoryIOSchema = defineSchema(
  {
    name: SchemaType.String({ default: "factory-io" }),
    prefix: SchemaType.String({ default: ">" }),
  },
  { $id: "test-helpers:factory-io-config" },
);

const FactoryIONode = defineIONode({
  type: "factory-io",
  category: "function",
  configSchema: FactoryIOSchema,

  created() {
    this.log("factory io created");
  },

  input(msg) {
    this.send({ payload: `${this.config.prefix} ${msg.payload}` });
  },
});

// --- Settings fixture ---

const SettingsSchema = defineSchema(
  {
    timeout: SchemaType.Number({ default: 5000, exportable: true }),
  },
  { $id: "test-helpers:settings" },
);

class TestSettingsNode extends IONode {
  static override readonly type = "test-settings";
  static override readonly category = "function";
  static override readonly settingsSchema: Schema = SettingsSchema;

  async input(_msg: any) {
    this.send({ payload: this.settings.timeout });
  }
}

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
    expect(node.sent(0)).toEqual([{ payload: "hello world" }]);
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
    expect(node.sent(0)).toEqual([{ payload: "hello b" }]);
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
  it("should resolve config node references via configNodes", async () => {
    const { node: configNode } = await createNode(TestConfigNode, {
      config: { host: "myserver.com", port: 3000 },
      overrides: { id: "config-1" },
    });

    const { node } = await createNode(TestIONode, {
      config: { server: "config-1" },
      configNodes: { "config-1": configNode },
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
    expect(node.sent()).toEqual([{ payload: "hey there" }]);
  });

  it("should handle multiple messages", async () => {
    const { node } = await createNode(TestIONode);

    await node.receive({ payload: "a" });
    await node.receive({ payload: "b" });

    expect(node.sent()).toHaveLength(2);
    expect(node.sent(0)).toEqual([
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

    expect(node.sent(0)).toEqual([{ payload: 75, label: "above" }]);
    expect(node.sent(1)).toEqual([{ payload: 30, label: "below" }]);
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

    expect(node.sent(0)).toEqual([{ payload: "hello", port: 0 }]);
    expect(node.sent(1)).toEqual([{ payload: "hello", port: 1 }]);
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
    expect(node.sent(0)).toEqual([{ payload: "test", auth: "secret-123" }]);
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
    expect(node.sent(0)).toEqual([{ payload: "from-msg", auth: "key" }]);
  });

  it("should resolve string literal via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "hello", type: "str" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: "hello", auth: "key" }]);
  });

  it("should resolve number via TypedInput", async () => {
    const { node } = await createNode(TestCredNode, {
      config: { endpoint: { value: "42", type: "num" } },
      credentials: { apiKey: "key" },
    });

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: 42, auth: "key" }]);
  });
});

describe("error handling", () => {
  it("should not crash when input throws", async () => {
    const { node } = await createNode(TestErrorNode);

    await expect(node.receive({ payload: "test" })).rejects.toThrow(
      "something broke",
    );
    expect(node.sent()).toHaveLength(0);
  });
});

describe("context store", () => {
  it("should support node context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({});
    await node.receive({});

    expect(node.sent(0)).toEqual([{ payload: 1 }, { payload: 2 }]);
  });

  it("should support flow context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({ scope: "flow" });

    expect(node.sent(0)).toEqual([{ payload: "flow-value" }]);
  });

  it("should support global context get/set", async () => {
    const { node } = await createNode(TestContextNode);

    await node.receive({ scope: "global" });

    expect(node.sent(0)).toEqual([{ payload: "global-value" }]);
  });
});

describe("i18n", () => {
  it("should resolve i18n keys via RED._", async () => {
    const { node } = await createNode(TestI18nNode);

    await node.receive({});

    // RED._ mock returns the key prefixed with node type
    expect(node.sent(0)).toEqual([{ payload: "test-i18n.greeting" }]);
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
    expect(node.sent(0)).toEqual([{ payload: "> hello" }]);
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
    expect(node.sent(0)).toEqual([{ payload: ">> test" }]);
  });
});

describe("settings", () => {
  it("should resolve settings from RED.settings", async () => {
    const { node } = await createNode(TestSettingsNode, {
      settings: { testSettingsTimeout: 3000 },
    });

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: 3000 }]);
  });

  it("should use default settings when not provided", async () => {
    const { node } = await createNode(TestSettingsNode);

    await node.receive({});
    expect(node.sent(0)).toEqual([{ payload: 5000 }]);
  });
});
