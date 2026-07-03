import { describe, it, expect } from "vitest";
import { initValidator } from "@/sdk/lib/server/validation";
import { NrgError } from "@/sdk/lib/shared/errors";
import { createRED } from "@mocks/red";

describe("NodeRedValidator", () => {
  it("should skip initialization if validator is already set", () => {
    const RED = createRED();
    initValidator(RED);
    const first = RED.validator;
    initValidator(RED);
    expect(RED.validator).toBe(first);
  });

  describe("x-nrg-skip-validation keyword", () => {
    it("should accept any data when x-nrg-skip-validation is true", () => {
      const RED = createRED();
      initValidator(RED);

      const schema = {
        type: "object",
        properties: {
          transform: { "x-nrg-skip-validation": true },
        },
      };

      const result = RED.validator.validate({ transform: () => {} }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe("x-nrg-node-type keyword", () => {
    it("should validate node reference matches expected type", () => {
      const RED = createRED();
      RED.registerNode("node-123", { type: "remote-server" });
      initValidator(RED);

      const schema = {
        type: "object",
        properties: {
          server: {
            type: "string",
            "x-nrg-node-type": "remote-server",
          },
        },
      };

      const result = RED.validator.validate({ server: "node-123" }, schema);
      expect(result.valid).toBe(true);
    });

    it("should fail when node type does not match", () => {
      const RED = createRED();
      RED.registerNode("node-456", { type: "wrong-type" });
      initValidator(RED);

      const schema = {
        $id: "node-type-mismatch-test",
        type: "object",
        properties: {
          server: {
            type: "string",
            "x-nrg-node-type": "remote-server",
          },
        },
      };

      const result = RED.validator.validate({ server: "node-456" }, schema);
      expect(result.valid).toBe(false);
    });

    it("should pass when value is empty (optional ref)", () => {
      const RED = createRED();
      initValidator(RED);

      const schema = {
        $id: "node-type-empty-test",
        type: "object",
        properties: {
          server: {
            type: "string",
            "x-nrg-node-type": "remote-server",
          },
        },
      };

      const result = RED.validator.validate({ server: "" }, schema);
      expect(result.valid).toBe(true);
    });

    it("should fail when node does not exist", () => {
      const RED = createRED();
      initValidator(RED);

      const schema = {
        $id: "node-type-missing-test",
        type: "object",
        properties: {
          server: {
            type: "string",
            "x-nrg-node-type": "remote-server",
          },
        },
      };

      const result = RED.validator.validate({ server: "nonexistent" }, schema);
      expect(result.valid).toBe(false);
    });
  });

  describe("custom formats", () => {
    it("should validate node-id format", () => {
      const RED = createRED();
      initValidator(RED);

      const schema = {
        $id: "node-id-format-test",
        type: "object",
        properties: {
          id: { type: "string", format: "node-id" },
        },
      };

      const valid = RED.validator.validate({ id: "abc-123_def" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = RED.validator.validate({ id: "has spaces!" }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe("reserveSchemaId", () => {
    it("throws NrgError when two different schemas claim the same $id", () => {
      const RED = createRED();
      initValidator(RED);

      const first = { $id: "my-node:configs", type: "object" };
      const second = { $id: "my-node:configs", type: "object" };

      RED.validator.reserveSchemaId(first, "a.config");
      expect(() => RED.validator.reserveSchemaId(second, "b.config")).toThrow(
        NrgError,
      );
      expect(() => RED.validator.reserveSchemaId(second, "b.config")).toThrow(
        'Duplicate schema $id "my-node:configs"',
      );
    });

    it("is idempotent for the same schema object (re-deploy / reuse)", () => {
      const RED = createRED();
      initValidator(RED);

      const schema = { $id: "my-node:configs", type: "object" };
      RED.validator.reserveSchemaId(schema, "my-node.config");
      expect(() =>
        RED.validator.reserveSchemaId(schema, "my-node.input"),
      ).not.toThrow();
    });

    it("is a no-op for a schema without $id", () => {
      const RED = createRED();
      initValidator(RED);

      expect(() =>
        RED.validator.reserveSchemaId({ type: "object" }, "my-node.input"),
      ).not.toThrow();
    });
  });
});
