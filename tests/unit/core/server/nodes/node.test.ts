import { describe, it, expect, vi, beforeEach } from "vitest";
import { Node } from "../../../../../src/core/server/nodes/node";
import { initValidator } from "../../../../../src/core/server/validation";
import { defineSchema, SchemaType } from "../../../../../src/core/server/schemas";
import { createMockRED, createMockNodeRedNode } from "../../../../mocks/red";

class ConcreteNode extends Node {
  static override readonly type = "test-node";
  static override readonly category = "function";
}

describe("Node", () => {
  beforeEach(() => {
    initValidator(createMockRED());
  });

  describe("constructor", () => {
    it("should set RED, node, and config", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode({ credentials: { apiKey: "secret" } });
      const config = { name: "test" };

      const instance = new (ConcreteNode as any)(RED, node, config, {});
      expect(instance.id).toBe("node-1");
      expect(instance.name).toBe("test-node");
      expect(instance.z).toBe("flow-1");
    });

    it("should make config read-only via proxy", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const config = { name: "test" };

      const instance = new (ConcreteNode as any)(RED, node, config, {});
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

      const RED = createMockRED();
      const node = createMockNodeRedNode();

      new (ValidatedNode as any)(RED, node, { name: "ab" }, {});
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

      const RED = createMockRED();
      const node = createMockNodeRedNode();

      new (ValidNode as any)(RED, node, { name: "hello" }, {});
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

      const RED = createMockRED();
      const node = createMockNodeRedNode();

      new (CredNode as any)(RED, node, {}, { apiKey: "ab" });
      expect(node.warn).toHaveBeenCalled();
    });
  });

  describe("i18n", () => {
    it("should call RED._ with node type prefix", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      instance.i18n("label.name");
      expect(RED._).toHaveBeenCalledWith("test-node.label.name", undefined);
    });

    it("should pass substitutions", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      instance.i18n("errors.invalid", { field: "name" });
      expect(RED._).toHaveBeenCalledWith("test-node.errors.invalid", {
        field: "name",
      });
    });
  });

  describe("timers", () => {
    it("should create and track setTimeout", () => {
      vi.useFakeTimers();
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});
      const fn = vi.fn();

      instance.setTimeout(fn, 100);
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it("should create and track setInterval", () => {
      vi.useFakeTimers();
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});
      const fn = vi.fn();

      instance.setInterval(fn, 50);
      vi.advanceTimersByTime(150);
      expect(fn).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("should clear timers on _closed", async () => {
      vi.useFakeTimers();
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});
      const fn = vi.fn();

      instance.setTimeout(fn, 1000);
      instance.setInterval(fn, 1000);

      await instance._closed();
      vi.advanceTimersByTime(2000);
      expect(fn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should support manual clearTimeout", () => {
      vi.useFakeTimers();
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});
      const fn = vi.fn();

      const timer = instance.setTimeout(fn, 100);
      instance.clearTimeout(timer);
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should support manual clearInterval", () => {
      vi.useFakeTimers();
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});
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
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      instance.log("test message");
      expect(node.log).toHaveBeenCalledWith("test message");
    });

    it("should delegate warn to node.warn", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      instance.warn("warning");
      expect(node.warn).toHaveBeenCalledWith("warning");
    });

    it("should delegate error to node.error", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      instance.error("error msg", { payload: "data" });
      expect(node.error).toHaveBeenCalledWith("error msg", {
        payload: "data",
      });
    });
  });

  describe("credentials", () => {
    it("should return node.credentials", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode({ credentials: { apiKey: "secret" } });
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      expect(instance.credentials).toEqual({ apiKey: "secret" });
    });
  });

  describe("settings", () => {
    it("should return cached settings", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      // No settings schema, so returns empty object
      expect(instance.settings).toEqual({});
    });
  });

  describe("_settings static method", () => {
    it("should return undefined when no settingsSchema", () => {
      expect(ConcreteNode._settings()).toBeUndefined();
    });

    it("should generate prefixed settings keys", () => {
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

      const result = SettingsNode._settings();
      expect(result).toEqual({
        myNodeApiEndpoint: {
          value: "https://example.com",
          exportable: true,
        },
        myNodeMaxRetries: { value: 3, exportable: false },
      });
    });

    it("should handle hyphenated type names", () => {
      const settingsSchema = defineSchema(
        { timeout: SchemaType.Number({ default: 5000 }) },
        { $id: "settings-hyphen-test" },
      );

      class HyphenNode extends Node {
        static override readonly type = "my-custom-node";
        static override readonly category = "function";
        static override readonly settingsSchema = settingsSchema;
      }

      const result = HyphenNode._settings();
      expect(result).toHaveProperty("myCustomNodeTimeout");
    });
  });

  describe("resolveTypedInput", () => {
    it("should call RED.util.evaluateNodeProperty", () => {
      const RED = createMockRED();
      RED.util.evaluateNodeProperty.mockImplementation(
        (_v: any, _t: any, _n: any, _m: any, cb: Function) =>
          cb(null, "resolved"),
      );
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      const promise = instance.resolveTypedInput({ value: "test", type: "str" });
      return expect(promise).resolves.toBe("resolved");
    });

    it("should reject on error", () => {
      const RED = createMockRED();
      RED.util.evaluateNodeProperty.mockImplementation(
        (_v: any, _t: any, _n: any, _m: any, cb: Function) =>
          cb(new Error("eval failed")),
      );
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      return expect(
        instance.resolveTypedInput({ value: "test", type: "str" }),
      ).rejects.toThrow("eval failed");
    });

    it("should resolve _node for node-type typed inputs", () => {
      const RED = createMockRED();
      const mockNodeInstance = { id: "n1", type: "my-type" };
      RED.util.evaluateNodeProperty.mockImplementation(
        (_v: any, _t: any, _n: any, _m: any, cb: Function) =>
          cb(null, { _node: mockNodeInstance }),
      );
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});

      return expect(
        instance.resolveTypedInput({ value: "n1", type: "node" }),
      ).resolves.toBe(mockNodeInstance);
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

      const RED = createMockRED();
      RED.settings.settingsValidTimeout = 3000;

      SettingsValidNode.validateSettings(RED);

      const node = createMockNodeRedNode();
      const instance = new (SettingsValidNode as any)(RED, node, {}, {});
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

      const RED = createMockRED();
      DefaultSettingsNode.validateSettings(RED);

      const node = createMockNodeRedNode();
      const instance = new (DefaultSettingsNode as any)(RED, node, {}, {});
      expect(instance.settings.retries).toBe(3);
    });

    it("should do nothing when no settingsSchema", () => {
      const RED = createMockRED();
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

      const RED = createMockRED();
      FuncSettingsNode.validateSettings(RED);

      const node = createMockNodeRedNode();
      const instance = new (FuncSettingsNode as any)(RED, node, {}, {});
      expect(instance.settings.transform("hello")).toBe("HELLO");
    });
  });

  describe("on", () => {
    it("should delegate to node.on", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (ConcreteNode as any)(RED, node, {}, {});
      const cb = vi.fn();

      instance.on("input", cb);
      expect(node.on).toHaveBeenCalledWith("input", cb);
    });
  });
});
