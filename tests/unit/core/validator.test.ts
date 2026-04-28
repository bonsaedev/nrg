import { describe, it, expect } from "vitest";
import { Validator, ValidationError } from "../../../src/core/validator";

describe("Validator", () => {
  describe("validate", () => {
    it("should return valid for correct data", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };
      const result = validator.validate({ name: "test" }, schema);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: "test" });
    });

    it("should return invalid for incorrect data", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
        },
        required: ["name"],
      };
      const result = validator.validate({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("should throw ValidationError when throwOnError is true", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };
      expect(() =>
        validator.validate({}, schema, { throwOnError: true }),
      ).toThrow(ValidationError);
    });

    it("should not throw when throwOnError is false", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };
      const result = validator.validate({}, schema, { throwOnError: false });
      expect(result.valid).toBe(false);
    });

    it("should apply default values", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string", default: "hello" },
        },
      };
      const data: any = {};
      validator.validate(data, schema);
      expect(data.name).toBe("hello");
    });

    it("should cache validators by cacheKey", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };
      const v1 = validator.createValidator(schema, "test-cache");
      const v2 = validator.createValidator(schema, "test-cache");
      expect(v1).toBe(v2);
    });

    it("should cache validators by $id", () => {
      const validator = new Validator();
      const schema = {
        $id: "test-schema-id",
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };
      const v1 = validator.createValidator(schema);
      const v2 = validator.createValidator(schema);
      expect(v1).toBe(v2);
    });
  });

  describe("custom keywords", () => {
    it("should support custom keyword validation", () => {
      const validator = new Validator({
        customKeywords: [
          {
            keyword: "x-test-keyword",
            type: "string",
            validate: (schemaValue: string, dataValue: string) => {
              return dataValue.startsWith(schemaValue);
            },
          },
        ],
      });
      const schema = {
        type: "object",
        properties: {
          value: { type: "string", "x-test-keyword": "hello" },
        },
      };
      const valid = validator.validate({ value: "hello world" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validator.validate({ value: "world" }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe("custom formats", () => {
    it("should support regex formats", () => {
      const validator = new Validator({
        customFormats: {
          "test-format": /^[A-Z]+$/,
        },
      });
      const schema = {
        type: "object",
        properties: {
          value: { type: "string", format: "test-format" },
        },
      };
      const valid = validator.validate({ value: "ABC" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validator.validate({ value: "abc" }, schema);
      expect(invalid.valid).toBe(false);
    });

    it("should support function formats", () => {
      const validator = new Validator({
        customFormats: {
          "even-length": (data: string) => data.length % 2 === 0,
        },
      });
      const schema = {
        type: "object",
        properties: {
          value: { type: "string", format: "even-length" },
        },
      };
      const valid = validator.validate({ value: "ab" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validator.validate({ value: "abc" }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe("formatErrors", () => {
    it("should return 'No errors' for empty errors", () => {
      const validator = new Validator();
      expect(validator.formatErrors(null)).toBe("No errors");
      expect(validator.formatErrors([])).toBe("No errors");
    });

    it("should format errors as semicolon-separated string", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          age: { type: "number", minimum: 0 },
        },
        required: ["name", "age"],
      };
      const result = validator.validate({}, schema);
      expect(result.errorMessage).toBeDefined();
      expect(result.errorMessage).toContain(";");
    });
  });

  describe("getDetailedErrors", () => {
    it("should return empty array for no errors", () => {
      const validator = new Validator();
      expect(validator.getDetailedErrors(null)).toEqual([]);
      expect(validator.getDetailedErrors([])).toEqual([]);
    });

    it("should return detailed error objects", () => {
      const validator = new Validator();
      const schema = {
        type: "object",
        properties: {
          name: { type: "string", minLength: 3 },
        },
        required: ["name"],
      };
      const result = validator.validate({ name: "ab" }, schema);
      const detailed = validator.getDetailedErrors(result.errors);
      expect(detailed.length).toBeGreaterThan(0);
      expect(detailed[0]).toHaveProperty("field");
      expect(detailed[0]).toHaveProperty("message");
      expect(detailed[0]).toHaveProperty("keyword");
      expect(detailed[0]).toHaveProperty("params");
      expect(detailed[0]).toHaveProperty("schemaPath");
    });
  });

  describe("addSchema / removeSchema", () => {
    it("should add and reference schemas", () => {
      const validator = new Validator();
      validator.addSchema(
        {
          $id: "address",
          type: "object",
          properties: {
            street: { type: "string" },
          },
          required: ["street"],
        },
      );
      const schema = {
        type: "object",
        properties: {
          address: { $ref: "address" },
        },
      };
      const valid = validator.validate(
        { address: { street: "Main St" } },
        schema,
      );
      expect(valid.valid).toBe(true);
    });

    it("should remove schemas", () => {
      const validator = new Validator();
      validator.addSchema(
        { $id: "removable", type: "string" },
      );
      validator.removeSchema("removable");
      expect(validator.createValidator({ $id: "removable-2", type: "string" })).toBeDefined();
    });
  });
});

describe("ValidationError", () => {
  it("should be an instance of Error", () => {
    const error = new ValidationError("test", []);
    expect(error).toBeInstanceOf(Error);
  });

  it("should be an instance of ValidationError", () => {
    const error = new ValidationError("test", []);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it("should store errors array", () => {
    const errors = [{ keyword: "required" }] as any;
    const error = new ValidationError("test", errors);
    expect(error.errors).toBe(errors);
  });

  it("should have name set to ValidationError", () => {
    const error = new ValidationError("test", []);
    expect(error.name).toBe("ValidationError");
  });
});
