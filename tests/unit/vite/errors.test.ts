import { describe, it, expect } from "vitest";
import {
  PluginError,
  NodeRedStartError,
  BuildError,
  ConfigError,
} from "../../../src/vite/errors";

describe("PluginError", () => {
  it("should be an instance of Error", () => {
    const error = new PluginError("test", "TEST_CODE");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PluginError);
  });

  it("should store code and message", () => {
    const error = new PluginError("something failed", "FAIL_CODE");
    expect(error.message).toBe("something failed");
    expect(error.code).toBe("FAIL_CODE");
    expect(error.name).toBe("PluginError");
  });

  it("should store cause", () => {
    const cause = new Error("root cause");
    const error = new PluginError("wrapper", "CODE", cause);
    expect(error.cause).toBe(cause);
  });
});

describe("NodeRedStartError", () => {
  it("should have correct defaults", () => {
    const error = new NodeRedStartError();
    expect(error.name).toBe("NodeRedStartError");
    expect(error.code).toBe("NODE_RED_START_FAILED");
    expect(error.message).toBe("Failed to start Node-RED");
  });

  it("should be an instance of PluginError", () => {
    const error = new NodeRedStartError();
    expect(error).toBeInstanceOf(PluginError);
    expect(error).toBeInstanceOf(Error);
  });

  it("should store cause", () => {
    const cause = new Error("port in use");
    const error = new NodeRedStartError(cause);
    expect(error.cause).toBe(cause);
  });
});

describe("BuildError", () => {
  it("should format server phase correctly", () => {
    const error = new BuildError("server");
    expect(error.name).toBe("BuildError");
    expect(error.code).toBe("BUILD_SERVER_FAILED");
    expect(error.message).toBe("Failed to build server");
  });

  it("should format client phase correctly", () => {
    const error = new BuildError("client");
    expect(error.code).toBe("BUILD_CLIENT_FAILED");
    expect(error.message).toBe("Failed to build client");
  });

  it("should be an instance of PluginError", () => {
    const error = new BuildError("server");
    expect(error).toBeInstanceOf(PluginError);
  });

  it("should store cause", () => {
    const cause = new Error("compilation error");
    const error = new BuildError("client", cause);
    expect(error.cause).toBe(cause);
  });
});

describe("ConfigError", () => {
  it("should have correct defaults", () => {
    const error = new ConfigError("invalid port");
    expect(error.name).toBe("ConfigError");
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toBe("invalid port");
  });

  it("should be an instance of PluginError", () => {
    const error = new ConfigError("bad config");
    expect(error).toBeInstanceOf(PluginError);
    expect(error).toBeInstanceOf(Error);
  });
});
