import { describe, it, expect, vi } from "vitest";
import { Node } from "@/sdk/lib/server/nodes/node";
import { initValidator } from "@/sdk/lib/server/validation";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import { createRED, createNodeRedNode } from "@mocks/red";
import { NRG_WIRE_HANDLERS } from "@/sdk/lib/server/nodes/symbols";

class ConcreteNode extends Node {
  static override readonly type = "test-node";
  static override readonly category = "function";
}

describe("Node", () => {
  describe("constructor", () => {
    it("should set RED, node, and config", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode({ credentials: { apiKey: "secret" } });
      const config = { name: "test" };

      const instance = new ConcreteNode(RED, node, config, {});
      expect(instance.id).toBe(node.id);
      expect(instance.name).toBe(node.name);
      expect(instance.z).toBe("flow-1");
    });

    it("should make config read-only via proxy", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const config = { name: "test" };

      const instance = new ConcreteNode(RED, node, config, {});
      expect(() => {
        instance.config.name = "changed";
      }).toThrow();
    });

    it("should validate config when configSchema is defined", () => {
      const schema = defineSchema(
        { name: SchemaType.String({ minLength: 3 }) },
        { $id: "test-node-config-validation" },
      );

      class ValidatedNode extends Node {
        static override readonly type = "validated-node";
        static override readonly category = "function";
        static override readonly configSchema = schema;
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();

      new ValidatedNode(RED, node, { name: "ab" }, {});
      expect(node.warn).toHaveBeenCalled();
    });

    it("should not warn when config is valid", () => {
      const schema = defineSchema(
        { name: SchemaType.String({ minLength: 3 }) },
        { $id: "test-node-config-valid" },
      );

      class ValidNode extends Node {
        static override readonly type = "valid-node";
        static override readonly category = "function";
        static override readonly configSchema = schema;
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();

      new ValidNode(RED, node, { name: "hello" }, {});
      expect(node.warn).not.toHaveBeenCalled();
    });

    it("should validate credentials when credentialsSchema is defined", () => {
      const credSchema = defineSchema(
        { apiKey: SchemaType.String({ minLength: 5 }) },
        { $id: "test-node-cred-validation" },
      );

      class CredNode extends Node {
        static override readonly type = "cred-node";
        static override readonly category = "function";
        static override readonly credentialsSchema = credSchema;
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();

      new CredNode(RED, node, {}, { apiKey: "ab" });
      expect(node.warn).toHaveBeenCalled();
    });
  });

  describe("i18n", () => {
    it("should call RED._ with node type prefix", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});

      instance.i18n("label.name");
      expect(RED._).toHaveBeenCalledWith("test-node.label.name", undefined);
    });

    it("should pass substitutions", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});

      instance.i18n("errors.invalid", { field: "name" });
      expect(RED._).toHaveBeenCalledWith("test-node.errors.invalid", {
        field: "name",
      });
    });
  });

  describe("timers", () => {
    it("should create and track setTimeout", () => {
      vi.useFakeTimers();
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});
      const fn = vi.fn();

      instance.setTimeout(fn, 100);
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it("should create and track setInterval", () => {
      vi.useFakeTimers();
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});
      const fn = vi.fn();

      instance.setInterval(fn, 50);
      vi.advanceTimersByTime(150);
      expect(fn).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("should clear timers on close", async () => {
      vi.useFakeTimers();
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});
      const fn = vi.fn();

      // Wire up close handler via the template method
      const createdPromise = Promise.resolve();
      instance[NRG_WIRE_HANDLERS](node, createdPromise);

      instance.setTimeout(fn, 1000);
      instance.setInterval(fn, 1000);

      const done = vi.fn();
      await node.emit("close", false, done);
      vi.advanceTimersByTime(2000);
      expect(fn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should support manual clearTimeout", () => {
      vi.useFakeTimers();
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});
      const fn = vi.fn();

      const timer = instance.setTimeout(fn, 100);
      instance.clearTimeout(timer);
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should support manual clearInterval", () => {
      vi.useFakeTimers();
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});
      const fn = vi.fn();

      const interval = instance.setInterval(fn, 50);
      instance.clearInterval(interval);
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("logging", () => {
    it("should delegate log to node.log", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});

      instance.log("test message");
      expect(node.log).toHaveBeenCalledWith("test message");
    });

    it("should delegate warn to node.warn", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});

      instance.warn("warning");
      expect(node.warn).toHaveBeenCalledWith("warning");
    });

    it("should delegate error to node.error", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});

      instance.error("error msg", { payload: "data" });
      expect(node.error).toHaveBeenCalledWith("error msg", {
        payload: "data",
      });
    });
  });

  describe("credentials", () => {
    it("should return node.credentials", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode({ credentials: { apiKey: "secret" } });
      const instance = new ConcreteNode(RED, node, {}, {});

      expect(instance.credentials).toEqual({ apiKey: "secret" });
    });
  });

  describe("settings", () => {
    it("should return cached settings", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});

      // No settings schema, so returns empty object
      expect(instance.settings).toEqual({});
    });
  });

  describe("settings registration", () => {
    it("should not pass settings when no settingsSchema", async () => {
      const RED = createRED();
      initValidator(RED);
      await ConcreteNode.register(RED);

      const registerCall = vi.mocked(RED.nodes.registerType).mock.calls[0];
      expect(registerCall[2].settings).toBeUndefined();
    });

    it("should generate prefixed settings keys", async () => {
      const settingsSchema = defineSchema(
        {
          apiEndpoint: SchemaType.String({
            default: "https://example.com",
            exportable: true,
          }),
          maxRetries: SchemaType.Number({ default: 3 }),
        },
        { $id: "settings-test" },
      );

      class SettingsNode extends Node {
        static override readonly type = "my-node";
        static override readonly category = "function";
        static override readonly settingsSchema = settingsSchema;
      }

      const RED = createRED();
      initValidator(RED);
      await SettingsNode.register(RED);

      const registerCall = vi.mocked(RED.nodes.registerType).mock.calls[0];
      expect(registerCall[2].settings).toEqual({
        myNodeApiEndpoint: {
          value: "https://example.com",
          exportable: true,
        },
        myNodeMaxRetries: { value: 3, exportable: false },
      });
    });

    it("should handle hyphenated type names", async () => {
      const settingsSchema = defineSchema(
        { timeout: SchemaType.Number({ default: 5000 }) },
        { $id: "settings-hyphen-test" },
      );

      class HyphenNode extends Node {
        static override readonly type = "my-custom-node";
        static override readonly category = "function";
        static override readonly settingsSchema = settingsSchema;
      }

      const RED = createRED();
      initValidator(RED);
      await HyphenNode.register(RED);

      const registerCall = vi.mocked(RED.nodes.registerType).mock.calls[0];
      expect(registerCall[2].settings).toHaveProperty("myCustomNodeTimeout");
    });
  });

  describe("validateSettings", () => {
    it("should validate and cache settings from RED.settings", () => {
      const settingsSchema = defineSchema(
        {
          timeout: SchemaType.Number({ default: 5000 }),
        },
        { $id: "validate-settings-test" },
      );

      class SettingsValidNode extends Node {
        static override readonly type = "settings-valid";
        static override readonly category = "function";
        static override readonly settingsSchema = settingsSchema;
      }

      const RED = createRED();
      initValidator(RED);
      RED.settings.settingsValidTimeout = 3000;

      SettingsValidNode.validateSettings(RED);

      const node = createNodeRedNode();
      const instance = new SettingsValidNode(RED, node, {}, {});
      expect(instance.settings.timeout).toBe(3000);
    });

    it("should use defaults when RED.settings has no value", () => {
      const settingsSchema = defineSchema(
        {
          retries: SchemaType.Number({ default: 3 }),
        },
        { $id: "validate-settings-default-test" },
      );

      class DefaultSettingsNode extends Node {
        static override readonly type = "default-settings";
        static override readonly category = "function";
        static override readonly settingsSchema = settingsSchema;
      }

      const RED = createRED();
      initValidator(RED);
      DefaultSettingsNode.validateSettings(RED);

      const node = createNodeRedNode();
      const instance = new DefaultSettingsNode(RED, node, {}, {});
      expect(instance.settings.retries).toBe(3);
    });

    it("should do nothing when no settingsSchema", () => {
      const RED = createRED();
      initValidator(RED);
      ConcreteNode.validateSettings(RED);
      // Should not throw
    });

    it("should handle _default for non-JSON types", () => {
      const fn = (s: string) => s.toUpperCase();
      const settingsSchema = defineSchema(
        {
          transform: SchemaType.Function(
            [SchemaType.String()],
            SchemaType.String(),
            { default: fn },
          ),
        },
        { $id: "validate-settings-func-test" },
      );

      class FuncSettingsNode extends Node {
        static override readonly type = "func-settings";
        static override readonly category = "function";
        static override readonly settingsSchema = settingsSchema;
      }

      const RED = createRED();
      initValidator(RED);
      FuncSettingsNode.validateSettings(RED);

      const node = createNodeRedNode();
      const instance = new FuncSettingsNode(RED, node, {}, {});
      expect(instance.settings.transform("hello")).toBe("HELLO");
    });
  });

  describe("on", () => {
    it("should delegate to node.on", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ConcreteNode(RED, node, {}, {});
      const cb = vi.fn();

      instance.on("input", cb);
      expect(node.on).toHaveBeenCalledWith("input", cb);
    });
  });

  describe("created hook error handling", () => {
    it("should not produce an unhandled rejection when created() throws", async () => {
      class FailingCreatedNode extends Node {
        static override readonly type = "failing-created-node";
        static override readonly category = "function";

        override async created() {
          throw new Error("init failed");
        }
      }

      const RED = createRED();
      initValidator(RED);
      await FailingCreatedNode.register(RED);

      const constructorFn = vi.mocked(RED.nodes.registerType).mock.calls[0][1];
      const nodeRedNode = createNodeRedNode();

      const unhandledRejection = vi.fn();
      process.on("unhandledRejection", unhandledRejection);

      try {
        constructorFn.call(nodeRedNode, {
          id: "n1",
          type: "failing-created-node",
          name: "",
        });
        await new Promise((r) => setTimeout(r, 50));

        expect(nodeRedNode.error).toHaveBeenCalledWith(
          "Error during created hook: init failed",
        );
        expect(unhandledRejection).not.toHaveBeenCalled();
      } finally {
        process.removeListener("unhandledRejection", unhandledRejection);
      }
    });
  });
});
