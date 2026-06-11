import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import * as clack from "@clack/prompts";
import { NodeRedLauncher } from "@/vite/node-red-launcher";
import { NodeRedStartError } from "@/vite/errors";
import { resolveNodeRed } from "@/vite/node-red-launcher/entry-point";
import { generateRuntimeSettings } from "@/vite/node-red-launcher/settings";
import * as nodeRedProcess from "@/vite/node-red-launcher/process";
import type { StartOptions } from "@/vite/node-red-launcher/types";

vi.mock("@/vite/node-red-launcher/entry-point", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/vite/node-red-launcher/entry-point")
    >();
  return {
    ...actual,
    resolveNodeRed: vi.fn(),
  };
});

vi.mock("@/vite/node-red-launcher/settings", () => ({
  generateRuntimeSettings: vi.fn(),
}));

vi.mock("@/vite/node-red-launcher/process", () => ({
  start: vi.fn(),
  stop: vi.fn(),
  kill: vi.fn(),
  acquirePort: vi.fn(),
  waitForPortRelease: vi.fn(),
}));

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

function createMockChild(pid: number | undefined = 12345) {
  const child = new EventEmitter() as any;
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("NodeRedLauncher", () => {
  beforeEach(() => {
    vi.mocked(resolveNodeRed).mockReset();
    vi.mocked(generateRuntimeSettings).mockReset();
    vi.mocked(nodeRedProcess.acquirePort).mockReset();
    vi.mocked(nodeRedProcess.waitForPortRelease).mockReset();
    vi.mocked(nodeRedProcess.start).mockReset();
    vi.mocked(nodeRedProcess.stop).mockReset();
    vi.mocked(nodeRedProcess.kill).mockReset();
    vi.mocked(clack.log.error).mockReset();
    vi.mocked(clack.log.warn).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockHappyStart({
    port = 1880,
    pid = 12345,
  }: { port?: number; pid?: number } = {}) {
    const child = createMockChild(pid);
    vi.mocked(nodeRedProcess.acquirePort).mockResolvedValue(port);
    vi.mocked(resolveNodeRed).mockResolvedValue("/fake/red.js");
    vi.mocked(generateRuntimeSettings).mockResolvedValue({
      filepath: "/tmp/settings.cjs",
      tempFiles: ["/tmp/settings.cjs"],
    });
    vi.mocked(nodeRedProcess.start).mockReturnValue({
      child,
      ready: Promise.resolve(),
    });
    vi.mocked(nodeRedProcess.kill).mockResolvedValue(undefined);
    return { child };
  }

  function lastOnLine(): StartOptions["onLine"] {
    const calls = vi.mocked(nodeRedProcess.start).mock.calls;
    return calls[calls.length - 1][0].onLine;
  }

  describe("getters", () => {
    it("preferredPort defaults to 1880", () => {
      expect(new NodeRedLauncher("dist", {}).preferredPort).toBe(1880);
    });

    it("preferredPort returns configured port", () => {
      const launcher = new NodeRedLauncher("dist", {
        runtime: { port: 3000 },
      });
      expect(launcher.preferredPort).toBe(3000);
    });

    it("restartDelay defaults to 1000", () => {
      expect(new NodeRedLauncher("dist", {}).restartDelay).toBe(1000);
    });

    it("restartDelay returns configured delay", () => {
      expect(
        new NodeRedLauncher("dist", { restartDelay: 500 }).restartDelay,
      ).toBe(500);
    });

    it("pid returns null when no process", () => {
      expect(new NodeRedLauncher("dist", {}).pid).toBeNull();
    });

    it("pid returns the spawned process pid", async () => {
      mockHappyStart({ pid: 42 });
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();

      expect(launcher.pid).toBe(42);
    });

    it("nodeRedCommand reflects the configured version", () => {
      expect(new NodeRedLauncher("dist", {}).nodeRedCommand).toBe("node-red");
      expect(
        new NodeRedLauncher("dist", { runtime: { version: "latest" } })
          .nodeRedCommand,
      ).toBe("node-red@latest");
      expect(
        new NodeRedLauncher("dist", { runtime: { version: "5.0.0-beta.6" } })
          .nodeRedCommand,
      ).toBe("node-red@5.0.0-beta.6");
    });
  });

  describe("start", () => {
    it("acquires a port, resolves node-red, generates settings, and spawns", async () => {
      mockHappyStart();
      const launcher = new NodeRedLauncher("dist", { args: ["--safe"] });

      const port = await launcher.start();

      expect(port).toBe(1880);
      expect(nodeRedProcess.acquirePort).toHaveBeenCalledWith(
        expect.objectContaining({ preferredPort: 1880 }),
      );
      expect(generateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({ outDir: "dist", port: 1880 }),
      );
      expect(nodeRedProcess.start).toHaveBeenCalledWith(
        expect.objectContaining({
          entryPoint: "/fake/red.js",
          settingsPath: "/tmp/settings.cjs",
          args: ["--safe"],
        }),
      );
    });

    it("passes the configured version to the resolver", async () => {
      mockHappyStart();
      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "5.0.0" },
      });

      await launcher.start();

      expect(resolveNodeRed).toHaveBeenCalledWith(
        expect.objectContaining({ version: "5.0.0" }),
      );
    });

    it("caches the resolved entry point across restarts", async () => {
      mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.waitForPortRelease).mockResolvedValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      await launcher.stop();
      await launcher.start();

      expect(resolveNodeRed).toHaveBeenCalledTimes(1);
    });

    it("re-resolves when the cached entry point no longer exists", async () => {
      mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.waitForPortRelease).mockResolvedValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      await launcher.stop();
      await launcher.start();

      expect(resolveNodeRed).toHaveBeenCalledTimes(2);
    });

    it("retries spawning and kills the failed attempt first", async () => {
      const failedChild = createMockChild(111);
      const okChild = createMockChild(222);

      vi.mocked(nodeRedProcess.acquirePort).mockResolvedValue(1880);
      vi.mocked(resolveNodeRed).mockResolvedValue("/fake/red.js");
      vi.mocked(generateRuntimeSettings).mockResolvedValue({
        filepath: "/tmp/settings.cjs",
        tempFiles: ["/tmp/settings.cjs"],
      });
      vi.mocked(nodeRedProcess.kill).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.start)
        .mockReturnValueOnce({
          child: failedChild,
          ready: Promise.reject(
            new NodeRedStartError(new Error("exited with code 1")),
          ),
        })
        .mockReturnValueOnce({
          child: okChild,
          ready: Promise.resolve(),
        });

      const launcher = new NodeRedLauncher("dist", {});
      const port = await launcher.start();

      expect(port).toBe(1880);
      expect(nodeRedProcess.start).toHaveBeenCalledTimes(2);
      expect(nodeRedProcess.kill).toHaveBeenCalledWith(111);
      expect(launcher.pid).toBe(222);
    });

    it("throws NodeRedStartError and kills the process after all retries fail", async () => {
      vi.mocked(nodeRedProcess.acquirePort).mockResolvedValue(1880);
      vi.mocked(resolveNodeRed).mockResolvedValue("/fake/red.js");
      vi.mocked(generateRuntimeSettings).mockResolvedValue({
        filepath: "/tmp/settings.cjs",
        tempFiles: ["/tmp/settings.cjs"],
      });
      vi.mocked(nodeRedProcess.kill).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.start).mockImplementation(() => ({
        child: createMockChild(333),
        ready: Promise.reject(new NodeRedStartError(new Error("spawn failed"))),
      }));

      const launcher = new NodeRedLauncher("dist", {});

      await expect(launcher.start()).rejects.toThrow(NodeRedStartError);
      expect(nodeRedProcess.start).toHaveBeenCalledTimes(3);
      expect(nodeRedProcess.kill).toHaveBeenCalledWith(333);
      expect(launcher.pid).toBeNull();
    });

    it("rethrows the original NodeRedStartError without re-wrapping", async () => {
      const originalError = new NodeRedStartError(new Error("spawn failed"));
      vi.mocked(nodeRedProcess.acquirePort).mockResolvedValue(1880);
      vi.mocked(resolveNodeRed).mockResolvedValue("/fake/red.js");
      vi.mocked(generateRuntimeSettings).mockResolvedValue({
        filepath: "/tmp/settings.cjs",
        tempFiles: ["/tmp/settings.cjs"],
      });
      vi.mocked(nodeRedProcess.kill).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.start).mockImplementation(() => ({
        child: createMockChild(333),
        ready: Promise.reject(originalError),
      }));

      const launcher = new NodeRedLauncher("dist", {});

      await expect(launcher.start()).rejects.toBe(originalError);
    });

    it("buffers lines emitted before ready", async () => {
      mockHappyStart();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      lastOnLine()("Loading palette", "stdout", false);

      expect(consoleSpy).not.toHaveBeenCalled();

      launcher.flushLogs();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Loading palette"),
      );
    });

    it("logs stdout lines directly after ready", async () => {
      mockHappyStart();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      lastOnLine()("After ready", "stdout", true);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("After ready"),
      );
    });

    it("routes stderr lines after ready to logger.error", async () => {
      mockHappyStart();
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      lastOnLine()("something broke", "stderr", true);

      expect(clack.log.error).toHaveBeenCalledWith(
        expect.stringContaining("something broke"),
      );
    });

    it("filters 'Server now running at' lines", async () => {
      mockHappyStart();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      lastOnLine()(
        "Server now running at http://localhost:1880/",
        "stdout",
        true,
      );

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("returns immediately when no process", async () => {
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.stop();

      expect(nodeRedProcess.stop).not.toHaveBeenCalled();
    });

    it("clears the process and port when it has no pid", async () => {
      const { child } = mockHappyStart();
      child.pid = undefined;
      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();

      await launcher.stop();

      expect(nodeRedProcess.stop).not.toHaveBeenCalled();
      expect(launcher.pid).toBeNull();
      expect((launcher as any).port).toBeNull();
    });

    it("stops the process and waits for the port to be released", async () => {
      const { child } = mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.waitForPortRelease).mockResolvedValue(true);

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();
      await launcher.stop();

      expect(nodeRedProcess.stop).toHaveBeenCalledWith(
        expect.objectContaining({ child, pid: 12345 }),
      );
      expect(nodeRedProcess.waitForPortRelease).toHaveBeenCalledWith(1880);
      expect(nodeRedProcess.kill).not.toHaveBeenCalled();
      expect(launcher.pid).toBeNull();
    });

    it("skips the port usage check when requested", async () => {
      mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();
      await launcher.stop(true);

      expect(nodeRedProcess.waitForPortRelease).not.toHaveBeenCalled();
    });

    it("force kills and re-checks when the port stays occupied", async () => {
      mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.waitForPortRelease)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();
      await launcher.stop();

      expect(nodeRedProcess.kill).toHaveBeenCalledWith(12345);
      expect(nodeRedProcess.waitForPortRelease).toHaveBeenCalledTimes(2);
    });
  });

  describe("serialization", () => {
    it("queues stop until an in-flight start completes", async () => {
      mockHappyStart();
      let resolveReady!: () => void;
      vi.mocked(nodeRedProcess.start).mockReturnValue({
        child: createMockChild(),
        ready: new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
      });
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.waitForPortRelease).mockResolvedValue(true);

      const launcher = new NodeRedLauncher("dist", {});
      const startPromise = launcher.start();
      const stopPromise = launcher.stop();

      let stopped = false;
      void stopPromise.then(() => {
        stopped = true;
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(stopped).toBe(false);
      expect(nodeRedProcess.stop).not.toHaveBeenCalled();

      resolveReady();
      await startPromise;
      await stopPromise;

      expect(nodeRedProcess.stop).toHaveBeenCalledTimes(1);
      expect(launcher.pid).toBeNull();
    });

    it("runs queued operations even when the previous one failed", async () => {
      vi.mocked(nodeRedProcess.acquirePort).mockRejectedValueOnce(
        new Error("no ports"),
      );

      const launcher = new NodeRedLauncher("dist", {});
      await expect(launcher.start()).rejects.toThrow(NodeRedStartError);

      mockHappyStart();
      await expect(launcher.start()).resolves.toBe(1880);
    });
  });

  describe("unexpected exit", () => {
    it("warns and clears state when Node-RED exits after ready", async () => {
      const { child } = mockHappyStart();
      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();

      child.emit("exit", 1, null);

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("exited unexpectedly (code 1)"),
      );
      expect(launcher.pid).toBeNull();

      await launcher.stop();
      expect(nodeRedProcess.stop).not.toHaveBeenCalled();
    });

    it("reports the signal when killed by one", async () => {
      const { child } = mockHappyStart();
      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();

      child.emit("exit", null, "SIGKILL");

      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("exited unexpectedly (SIGKILL)"),
      );
    });

    it("does not warn during a graceful stop", async () => {
      mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockImplementation(async (options) => {
        options.child.emit("exit", 0, null);
      });
      vi.mocked(nodeRedProcess.waitForPortRelease).mockResolvedValue(true);

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();
      await launcher.stop();

      expect(clack.log.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("exited unexpectedly"),
      );
    });

    it("does not warn when a process is killed during a restart", async () => {
      const { child } = mockHappyStart();
      vi.mocked(nodeRedProcess.acquirePort).mockResolvedValue(1880);

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();

      vi.mocked(nodeRedProcess.kill).mockImplementation(async () => {
        child.emit("exit", null, "SIGKILL");
      });
      await launcher.start();

      expect(clack.log.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("exited unexpectedly"),
      );
    });
  });

  describe("flushLogs", () => {
    it("handles an empty buffer", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const launcher = new NodeRedLauncher("dist", {});

      launcher.flushLogs();

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("flushes buffered lines once and clears the buffer", async () => {
      mockHappyStart();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      lastOnLine()("line 1", "stdout", false);
      lastOnLine()("line 2", "stderr", false);

      launcher.flushLogs();
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockClear();
      launcher.flushLogs();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("filters 'Server now running at' from buffered logs", async () => {
      mockHappyStart();
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const launcher = new NodeRedLauncher("dist", {});

      await launcher.start();
      lastOnLine()("Starting flows", "stdout", false);
      lastOnLine()(
        "Server now running at http://localhost:1880/",
        "stdout",
        false,
      );
      lastOnLine()("Started flows", "stdout", false);

      launcher.flushLogs();

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanup", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-launcher-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("removes every tracked temp file", async () => {
      const compiled = path.join(tmpDir, "compiled.cjs");
      const final = path.join(tmpDir, "final.cjs");
      fs.writeFileSync(compiled, "module.exports = {};");
      fs.writeFileSync(final, "module.exports = {};");

      mockHappyStart();
      vi.mocked(generateRuntimeSettings).mockResolvedValue({
        filepath: final,
        tempFiles: [compiled, final],
      });

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();
      launcher.cleanup();

      expect(fs.existsSync(compiled)).toBe(false);
      expect(fs.existsSync(final)).toBe(false);
    });

    it("accumulates temp files across restarts instead of overwriting", async () => {
      const first = path.join(tmpDir, "settings-1880.cjs");
      const second = path.join(tmpDir, "settings-3000.cjs");
      fs.writeFileSync(first, "module.exports = {};");
      fs.writeFileSync(second, "module.exports = {};");

      mockHappyStart();
      vi.mocked(nodeRedProcess.stop).mockResolvedValue(undefined);
      vi.mocked(nodeRedProcess.waitForPortRelease).mockResolvedValue(true);
      vi.mocked(generateRuntimeSettings)
        .mockResolvedValueOnce({ filepath: first, tempFiles: [first] })
        .mockResolvedValueOnce({ filepath: second, tempFiles: [second] });

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();
      await launcher.stop();
      await launcher.start();
      launcher.cleanup();

      expect(fs.existsSync(first)).toBe(false);
      expect(fs.existsSync(second)).toBe(false);
    });

    it("does nothing when no temp files are tracked", () => {
      const launcher = new NodeRedLauncher("dist", {});
      expect(() => launcher.cleanup()).not.toThrow();
    });

    it("ignores temp files that no longer exist", async () => {
      mockHappyStart();
      vi.mocked(generateRuntimeSettings).mockResolvedValue({
        filepath: "/nonexistent/final.cjs",
        tempFiles: ["/nonexistent/compiled.cjs", "/nonexistent/final.cjs"],
      });

      const launcher = new NodeRedLauncher("dist", {});
      await launcher.start();

      expect(() => launcher.cleanup()).not.toThrow();
    });
  });
});
