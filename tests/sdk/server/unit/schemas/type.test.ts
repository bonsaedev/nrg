import { describe, it, expect } from "vitest";
import { Kind } from "@sinclair/typebox";
import { SchemaType, defineSchema } from "@/sdk/lib/shared/schemas";
import { initValidator } from "@/sdk/lib/server/validation";
import { createRED } from "@mocks/red";

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
      const s = SchemaType.NodeRef("remote-server");
      expect(s[Kind]).toBe("NodeRef");
      expect(s["x-nrg-node-type"]).toBe("remote-server");
      expect(s.type).toBe("string");
      expect(s.format).toBe("node-id");
    });

    it("should include a default description", () => {
      const s = SchemaType.NodeRef("my-config");
      expect(s.description).toContain("my-config");
    });

    it("should allow custom description", () => {
      const s = SchemaType.NodeRef("my-config", {
        description: "Custom desc",
      });
      expect(s.description).toBe("Custom desc");
    });

    it("should pass through x-nrg-form options", () => {
      const s = SchemaType.NodeRef("my-config", {
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

    it("always sets a default type (str by default)", () => {
      const s = SchemaType.TypedInput() as { default?: { type?: string } };
      expect(s.default?.type).toBe("str");
    });

    it("defaults to the first available type when str is excluded", () => {
      const s = SchemaType.TypedInput({
        "x-nrg-form": { typedInputTypes: ["msg", "flow"] },
      }) as { default?: { type?: string } };
      expect(s.default?.type).toBe("msg");
    });

    it("keeps an explicit default type that is available", () => {
      const s = SchemaType.TypedInput({
        default: { type: "num", value: 0 },
        "x-nrg-form": { typedInputTypes: ["str", "num"] },
      }) as { default?: { type?: string } };
      expect(s.default?.type).toBe("num");
    });

    it("throws when the default type is not one of the available types", () => {
      expect(() =>
        SchemaType.TypedInput({
          default: { type: "num", value: 0 },
          "x-nrg-form": { typedInputTypes: ["str", "msg"] },
        }),
      ).toThrow(/not one of its typedInputTypes/);
    });

    it("trusts a custom default type when types are unrestricted", () => {
      // No typedInputTypes → the full set (incl. editor-registered custom types
      // like "sobject") isn't known here, so the explicit default is kept.
      const s = SchemaType.TypedInput({
        default: { type: "sobject", value: "" },
      }) as { default?: { type?: string } };
      expect(s.default?.type).toBe("sobject");
    });

    it("allows a custom type listed in typedInputTypes", () => {
      const s = SchemaType.TypedInput({
        default: { type: "sobject", value: "" },
        "x-nrg-form": { typedInputTypes: ["sobject", "str"] },
      }) as { default?: { type?: string } };
      expect(s.default?.type).toBe("sobject");
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

    const transformProp = schema.properties.transform as Record<
      string,
      unknown
    >;
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

    const transformProp = schema.properties.transform as Record<
      string,
      unknown
    >;
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

    const nameProp = schema.properties.name as Record<string, unknown>;
    const countProp = schema.properties.count as Record<string, unknown>;
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

    const tagsProp = schema.properties.tags as Record<string, any>;
    expect(tagsProp.type).toBe("array");
    expect(tagsProp.items).toBeDefined();
    expect(tagsProp.items.type).toBe("string");
  });

  it("should handle schemas with anyOf", () => {
    const schema = defineSchema(
      {
        value: SchemaType.Union([SchemaType.String(), SchemaType.Number()]),
      },
      { $id: "anyof-schema" },
    );

    const valueProp = schema.properties.value as Record<string, any>;
    expect(valueProp.anyOf).toBeDefined();
    expect(valueProp.anyOf).toHaveLength(2);
    expect(valueProp.anyOf[0].type).toBe("string");
    expect(valueProp.anyOf[1].type).toBe("number");
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

    const combinedProp = schema.properties.combined as Record<string, any>;
    expect(combinedProp.allOf).toBeDefined();
    expect(combinedProp.allOf).toHaveLength(2);
    expect(combinedProp.allOf[0].properties.a.type).toBe("string");
    expect(combinedProp.allOf[1].properties.b.type).toBe("number");
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
    const configProp = schema.properties.config as Record<string, unknown>;
    const nestedProps = configProp.properties as Record<string, unknown>;
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

  describe("defineSchema", () => {
    it("sets the required $id on the schema", () => {
      const schema = defineSchema(
        {
          name: SchemaType.String({ default: "test" }),
        },
        { $id: "type.test:1" },
      );
      expect(schema.type).toBe("object");
      expect(schema.$id).toBe("type.test:1");
      expect(schema.properties.name).toBeDefined();
    });

    it("keeps the provided $id", () => {
      const schema = defineSchema(
        { name: SchemaType.String({ default: "" }) },
        { $id: "explicit-id" },
      );
      expect(schema.$id).toBe("explicit-id");
    });

    it("works with the validator", () => {
      const RED = createRED();
      initValidator(RED);

      const schema = defineSchema(
        {
          payload: SchemaType.String({ minLength: 1 }),
        },
        { $id: "type.test:2" },
      );

      const result = RED.validator.validate({ payload: "hello" }, schema);
      expect(result.valid).toBe(true);

      const invalid = RED.validator.validate({ payload: "" }, schema);
      expect(invalid.valid).toBe(false);
    });
  });
});
