import { describe, it, expect } from "vitest";
import { initValidator, validator } from "../../../../src/core/server/validation";
import { createMockRED } from "../../../mocks/red";

describe("NodeRedValidator", () => {
  describe("x-nrg-skip-validation keyword", () => {
    it("should accept any data when x-nrg-skip-validation is true", () => {
      const RED = createMockRED();
      initValidator(RED);

      const schema = {
        type: "object",
        properties: {
          transform: { "x-nrg-skip-validation": true },
        },
      };

      const result = validator.validate({ transform: () => {} }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe("x-nrg-node-type keyword", () => {
    it("should validate node reference matches expected type", () => {
      const RED = createMockRED({
        "node-123": { type: "remote-server" },
      });
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

      const result = validator.validate({ server: "node-123" }, schema);
      expect(result.valid).toBe(true);
    });

    it("should fail when node type does not match", () => {
      const RED = createMockRED({
        "node-456": { type: "wrong-type" },
      });
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

      const result = validator.validate({ server: "node-456" }, schema);
      expect(result.valid).toBe(false);
    });

    it("should pass when value is empty (optional ref)", () => {
      const RED = createMockRED();
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

      const result = validator.validate({ server: "" }, schema);
      expect(result.valid).toBe(true);
    });

    it("should fail when node does not exist", () => {
      const RED = createMockRED({});
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

      const result = validator.validate({ server: "nonexistent" }, schema);
      expect(result.valid).toBe(false);
    });
  });

  describe("custom formats", () => {
    it("should validate node-id format", () => {
      const RED = createMockRED();
      initValidator(RED);

      const schema = {
        $id: "node-id-format-test",
        type: "object",
        properties: {
          id: { type: "string", format: "node-id" },
        },
      };

      const valid = validator.validate({ id: "abc-123_def" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validator.validate({ id: "has spaces!" }, schema);
      expect(invalid.valid).toBe(false);
    });

    it("should validate flow-id format", () => {
      const RED = createMockRED();
      initValidator(RED);

      const schema = {
        $id: "flow-id-format-test",
        type: "object",
        properties: {
          flowId: { type: "string", format: "flow-id" },
        },
      };

      const valid = validator.validate({ flowId: "abcdef0123456789" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validator.validate({ flowId: "too-short" }, schema);
      expect(invalid.valid).toBe(false);
    });

    it("should validate topic-path format", () => {
      const RED = createMockRED();
      initValidator(RED);

      const schema = {
        $id: "topic-path-format-test",
        type: "object",
        properties: {
          topic: { type: "string", format: "topic-path" },
        },
      };

      const valid = validator.validate({ topic: "devices/sensor_1/data" }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validator.validate({ topic: "has spaces!" }, schema);
      expect(invalid.valid).toBe(false);
    });
  });
});
