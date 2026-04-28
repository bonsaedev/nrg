import { describe, it, expect } from "vitest";
import { NrgError } from "../../../src/core/errors";

describe("NrgError", () => {
  it("should be an instance of Error", () => {
    const error = new NrgError("test");
    expect(error).toBeInstanceOf(Error);
  });

  it("should be an instance of NrgError", () => {
    const error = new NrgError("test");
    expect(error).toBeInstanceOf(NrgError);
  });

  it("should have name set to NrgError", () => {
    const error = new NrgError("test message");
    expect(error.name).toBe("NrgError");
  });

  it("should preserve the error message", () => {
    const error = new NrgError("something went wrong");
    expect(error.message).toBe("something went wrong");
  });

  it("should work with instanceof after catch", () => {
    try {
      throw new NrgError("caught");
    } catch (e) {
      expect(e).toBeInstanceOf(NrgError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("should have a stack trace", () => {
    const error = new NrgError("trace");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("NrgError");
  });
});
