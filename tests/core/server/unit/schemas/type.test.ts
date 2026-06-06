import { describe, it, expect } from "vitest";
import { Kind } from "@sinclair/typebox";
import {
  SchemaType,
  defineSchema,
} from "@/core/server/schemas";
import { initValidator } from "@/core/server/validation";
import { createNodeRedRuntime } from "@mocks/red";

describe("SchemaType", () => {
  describe("primitive types", () => {
    it("should create String schemas", () => {
      const s = SchemaType.String({ default: "hello" });
      expect(s.type).toBe("string");
      expect(s.default).toBe("hello");
    });

    it("should create Number schemas", () => {
      const s = SchemaType.Number({ default: 42 });
      expect(s.type).toBe("number");
      expect(s.default).toBe(42);
    });

    it("should create Boolean schemas", () => {
      const s = SchemaType.Boolean({ default: true });
      expect(s.type).toBe("boolean");
      expect(s.default).toBe(true);
    });
  });

  describe("NodeRef", () => {
    it("should create a NodeRef schema with x-nrg-node-type", () => {
      class MockNode {
        static type = "remote-server";
      }

      const s = SchemaType.NodeRef(MockNode as any);
      expect(s[Kind]).toBe("NodeRef");
      expect(s["x-nrg-node-type"]).toBe("remote-server");
      expect(s.type).toBe("string");
      expect(s.format).toBe("node-id");
    });

    it("should include a default description", () => {
      class MockNode {
        static type = "my-config";
      }

      const s = SchemaType.NodeRef(MockNode as any);
      expect(s.description).toContain("my-config");
    });

    it("should allow custom description", () => {
      class MockNode {
        static type = "my-config";
      }

      const s = SchemaType.NodeRef(MockNode as any, {
        description: "Custom desc",
      });
      expect(s.description).toBe("Custom desc");
    });

    it("should pass through x-nrg-form options", () => {
      class MockNode {
        static type = "my-config";
      }

      const s = SchemaType.NodeRef(MockNode as any, {
        "x-nrg-form": { icon: "server" },
      });
      expect(s["x-nrg-form"]).toEqual({ icon: "server" });
    });
  });

  describe("TypedInput", () => {
    it("should create a TypedInput schema", () => {
      const s = SchemaType.TypedInput();
      expect(s[Kind]).toBe("TypedInput");
      expect(s.type).toBe("object");
      expect(s.properties).toHaveProperty("value");
      expect(s.properties).toHaveProperty("type");
    });

    it("should pass through options", () => {
      const s = SchemaType.TypedInput({
        "x-nrg-form": { typedInputTypes: ["str", "num"] },
      });
      expect(s["x-nrg-form"]).toEqual({ typedInputTypes: ["str", "num"] });
    });
  });
});

describe("defineSchema", () => {
  it("should create a schema with $id", () => {
    const schema = defineSchema(
      { name: SchemaType.String({ default: "" }) },
      { $id: "test-schema" },
    );
    expect(schema.$id).toBe("test-schema");
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("name");
  });

  it("should mark non-JSON types as skip-validation", () => {
    const schema = defineSchema(
      {
        transform: SchemaType.Function(
          [SchemaType.String()],
          SchemaType.String(),
          { default: (s: string) => s },
        ),
      },
      { $id: "func-schema" },
    );

    const transformProp = schema.properties.transform as any;
    expect(transformProp["x-nrg-skip-validation"]).toBe(true);
    expect(transformProp.type).toBeUndefined();
  });

  it("should move default to _default for non-JSON types", () => {
    const fn = (s: string) => s;
    const schema = defineSchema(
      {
        transform: SchemaType.Function(
          [SchemaType.String()],
          SchemaType.String(),
          { default: fn },
        ),
      },
      { $id: "func-default-schema" },
    );

    const transformProp = schema.properties.transform as any;
    expect(transformProp.default).toBeUndefined();
    expect(transformProp._default).toBe(fn);
  });

  it("should not mark JSON types as skip-validation", () => {
    const schema = defineSchema(
      {
        name: SchemaType.String({ default: "test" }),
        count: SchemaType.Number({ default: 0 }),
      },
      { $id: "json-types-schema" },
    );

    const nameProp = schema.properties.name as any;
    const countProp = schema.properties.count as any;
    expect(nameProp["x-nrg-skip-validation"]).toBeUndefined();
    expect(countProp["x-nrg-skip-validation"]).toBeUndefined();
  });

  it("should handle schemas with items (arrays)", () => {
    const schema = defineSchema(
      {
        tags: SchemaType.Array(SchemaType.String({ default: "" }), {
          default: [],
        }),
      },
      { $id: "items-schema" },
    );

    expect(schema.properties.tags).toBeDefined();
    expect((schema.properties.tags as any).items).toBeDefined();
  });

  it("should handle schemas with anyOf", () => {
    const schema = defineSchema(
      {
        value: SchemaType.Union([SchemaType.String(), SchemaType.Number()]),
      },
      { $id: "anyof-schema" },
    );

    expect(schema.properties.value).toBeDefined();
  });

  it("should handle schemas with allOf via Intersect", () => {
    const schema = defineSchema(
      {
        combined: SchemaType.Intersect([
          SchemaType.Object({ a: SchemaType.String() }),
          SchemaType.Object({ b: SchemaType.Number() }),
        ]),
      },
      { $id: "allof-schema" },
    );

    expect(schema.properties.combined).toBeDefined();
  });

  it("should recursively handle nested schemas", () => {
    const schema = defineSchema(
      {
        config: SchemaType.Object({
          name: SchemaType.String({ default: "" }),
        }),
      },
      { $id: "nested-schema" },
    );

    expect(schema.properties.config).toBeDefined();
    const nestedProps = (schema.properties.config as any).properties;
    expect(nestedProps.name).toBeDefined();
  });

  describe("SchemaType.Object({}) as permissive schema", () => {
    it("should create a valid object schema with no properties", () => {
      const schema = SchemaType.Object({});
      expect(schema.type).toBe("object");
      expect(schema.properties).toEqual({});
      expect(schema.required ?? []).toEqual([]);
    });
  });

  describe("defineSchema without $id", () => {
    it("should create a valid schema without $id", () => {
      const schema = defineSchema({
        name: SchemaType.String({ default: "test" }),
      });
      expect(schema.type).toBe("object");
      expect(schema.$id).toBeUndefined();
      expect(schema.properties.name).toBeDefined();
    });

    it("should still accept $id when provided", () => {
      const schema = defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "explicit-id" },
      );
      expect(schema.$id).toBe("explicit-id");
    });

    it("should work with the validator without $id", () => {
      const RED = createNodeRedRuntime();
      initValidator(RED);

      const schema = defineSchema({
        payload: SchemaType.String({ minLength: 1 }),
      });

      const result = RED.validator.validate({ payload: "hello" }, schema, {
        cacheKey: "test-no-id:input",
      });
      expect(result.valid).toBe(true);

      const invalid = RED.validator.validate({ payload: "" }, schema, {
        cacheKey: "test-no-id:input",
      });
      expect(invalid.valid).toBe(false);
    });
  });
});
