import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
  log: {
    step: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}));

import * as clackLogger from "@clack/prompts";
import { Logger, logger } from "@/vite/logger";

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("format()", () => {
    it("adds prefix when prefix is set", () => {
      const log = new Logger({ name: "test", prefix: "my-prefix" });
      // Access format indirectly through step which calls format
      log.step("hello");
      expect(clackLogger.log.step).toHaveBeenCalledWith("[my-prefix] hello");
    });

    it("returns plain message when no prefix", () => {
      const log = new Logger({ name: "test" });
      log.step("hello");
      expect(clackLogger.log.step).toHaveBeenCalledWith("hello");
    });
  });

  describe("child()", () => {
    it("creates Logger with combined prefix", () => {
      const parent = new Logger({ name: "test", prefix: "a" });
      const child = parent.child("b");
      child.step("msg");
      expect(clackLogger.log.step).toHaveBeenCalledWith("[a:b] msg");
    });

    it("child of child creates nested prefix (a:b)", () => {
      const root = new Logger({ name: "test" });
      const child = root.child("a");
      const grandchild = child.child("b");
      grandchild.step("msg");
      expect(clackLogger.log.step).toHaveBeenCalledWith("[a:b] msg");
    });
  });

  describe("intro()", () => {
    it("calls clack intro with message", () => {
      const log = new Logger({ name: "test-name" });
      log.intro("Welcome");
      expect(clackLogger.intro).toHaveBeenCalledWith("Welcome");
    });

    it("calls clack intro with name when no message", () => {
      const log = new Logger({ name: "test-name" });
      log.intro();
      expect(clackLogger.intro).toHaveBeenCalledWith("test-name");
    });
  });

  describe("outro()", () => {
    it("delegates to clack outro", () => {
      const log = new Logger({ name: "test" });
      log.outro("Done");
      expect(clackLogger.outro).toHaveBeenCalledWith("Done");
    });
  });

  describe("step()", () => {
    it("delegates to clack log.step", () => {
      const log = new Logger({ name: "test" });
      log.step("stepping");
      expect(clackLogger.log.step).toHaveBeenCalledWith("stepping");
    });
  });

  describe("success()", () => {
    it("delegates to clack log.success", () => {
      const log = new Logger({ name: "test" });
      log.success("done");
      expect(clackLogger.log.success).toHaveBeenCalledWith("done");
    });
  });

  describe("warn()", () => {
    it("delegates to clack log.warn", () => {
      const log = new Logger({ name: "test" });
      log.warn("careful");
      expect(clackLogger.log.warn).toHaveBeenCalledWith("careful");
    });
  });

  describe("error()", () => {
    it("delegates to clack log.error", () => {
      const log = new Logger({ name: "test" });
      log.error("failed");
      expect(clackLogger.log.error).toHaveBeenCalledWith("failed");
    });

    it("with cause also calls console.error", () => {
      const log = new Logger({ name: "test" });
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const cause = new Error("root cause");
      log.error("failed", cause);
      expect(clackLogger.log.error).toHaveBeenCalledWith("failed");
      expect(consoleSpy).toHaveBeenCalledWith(cause);
      consoleSpy.mockRestore();
    });
  });

  describe("info()", () => {
    it("delegates to clack log.info", () => {
      const log = new Logger({ name: "test" });
      log.info("information");
      expect(clackLogger.log.info).toHaveBeenCalledWith("information");
    });
  });

  describe("message()", () => {
    it("delegates to clack log.message", () => {
      const log = new Logger({ name: "test" });
      log.message("hi");
      expect(clackLogger.log.message).toHaveBeenCalledWith("hi");
    });
  });

  describe("raw()", () => {
    it("outputs with prefix", () => {
      const log = new Logger({ name: "test", prefix: "pfx" });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.raw("raw message");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("pfx"));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("raw message"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("startGroup() / endGroup()", () => {
    it("startGroup outputs markers", () => {
      const log = new Logger({ name: "test" });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.startGroup("Group Title");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Group Title"),
      );
      consoleSpy.mockRestore();
    });

    it("endGroup outputs markers", () => {
      const log = new Logger({ name: "test" });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.endGroup("Finished");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Finished"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("startSpinner() / stopSpinner()", () => {
    it("startSpinner delegates to spinner.start with formatted message", () => {
      const log = new Logger({ name: "test", prefix: "sp" });
      log.startSpinner("Loading");
      const spinner = (log as any).spinner;
      expect(spinner.start).toHaveBeenCalledWith("[sp] Loading");
    });

    it("stopSpinner delegates to spinner.stop with formatted message", () => {
      const log = new Logger({ name: "test", prefix: "sp" });
      log.stopSpinner("Done");
      const spinner = (log as any).spinner;
      expect(spinner.stop).toHaveBeenCalledWith("[sp] Done");
    });
  });

  describe("raw() without prefix", () => {
    it("outputs without prefix tag", () => {
      const log = new Logger({ name: "test" });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.raw("plain message");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("plain message"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("startGroup() without title", () => {
    it("outputs bar without title", () => {
      const log = new Logger({ name: "test" });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.startGroup();
      expect(consoleSpy).toHaveBeenCalledWith("│");
      consoleSpy.mockRestore();
    });
  });

  describe("endGroup() without message", () => {
    it("outputs default Done message", () => {
      const log = new Logger({ name: "test" });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.endGroup();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Done"));
      consoleSpy.mockRestore();
    });
  });

  describe("singleton", () => {
    it("exports a logger instance", () => {
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});
