import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import detect from "detect-port";
import getPort from "get-port";
import treeKill from "tree-kill";
import * as nodeRedProcess from "@/vite/node-red-launcher/process";
import { NodeRedStartError } from "@/vite/errors";
import { Logger } from "@/vite/logger";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock("tree-kill", () => ({ default: vi.fn() }));
vi.mock("detect-port", () => ({ default: vi.fn() }));
vi.mock("get-port", () => ({ default: vi.fn() }));

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

function createMockProcess(pid: number = 12345) {
  const proc = new EventEmitter() as any;
  proc.pid = pid;
  proc.exitCode = null;
  proc.signalCode = null;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = null;
  proc.kill = vi.fn();
  return proc;
}

describe("node-red-launcher/process", () => {
  let logger: Logger;

  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(treeKill).mockReset();
    vi.mocked(detect).mockReset();
    vi.mocked(getPort).mockReset();
    logger = new Logger({ name: "test", prefix: "node-red" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("start", () => {
    function spawnWithMock(onLine = vi.fn()) {
      const proc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(proc);

      const managed = nodeRedProcess.start({
        entryPoint: "/fake/red.js",
        settingsPath: "/tmp/settings.cjs",
        args: [],
        onLine,
      });

      return { proc, managed, onLine };
    }

    it("spawns node with entry point, settings, and args", () => {
      const proc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(proc);

      nodeRedProcess.start({
        entryPoint: "/fake/red.js",
        settingsPath: "/tmp/settings.cjs",
        args: ["--safe"],
        onLine: vi.fn(),
      });

      expect(spawn).toHaveBeenCalledWith(
        process.execPath,
        ["/fake/red.js", "-s", "/tmp/settings.cjs", "--safe"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    });

    it("resolves ready on 'Started flows'", async () => {
      const { proc, managed } = spawnWithMock();

      proc.stdout.emit("data", Buffer.from("Started flows\n"));

      await expect(managed.ready).resolves.toBeUndefined();
    });

    it("resolves ready on 'Server now running'", async () => {
      const { proc, managed } = spawnWithMock();

      proc.stdout.emit(
        "data",
        Buffer.from("Server now running at http://localhost:1880/\n"),
      );

      await expect(managed.ready).resolves.toBeUndefined();
    });

    it("reports lines with ready=false before the marker and ready=true after", async () => {
      const { proc, managed, onLine } = spawnWithMock();

      proc.stdout.emit(
        "data",
        Buffer.from("Loading palette\nStarted flows\nAfter ready\n"),
      );
      await managed.ready;

      expect(onLine).toHaveBeenNthCalledWith(
        1,
        "Loading palette",
        "stdout",
        false,
      );
      expect(onLine).toHaveBeenNthCalledWith(
        2,
        "Started flows",
        "stdout",
        false,
      );
      expect(onLine).toHaveBeenNthCalledWith(3, "After ready", "stdout", true);
    });

    it("reports stderr lines with source 'stderr'", () => {
      const { proc, onLine } = spawnWithMock();

      proc.stderr.emit("data", Buffer.from("some warning\n"));

      expect(onLine).toHaveBeenCalledWith("some warning", "stderr", false);
    });

    it("does not become ready from stderr output", () => {
      const { proc, onLine } = spawnWithMock();

      proc.stderr.emit("data", Buffer.from("Started flows\n"));
      proc.stdout.emit("data", Buffer.from("still booting\n"));

      expect(onLine).toHaveBeenLastCalledWith("still booting", "stdout", false);
    });

    it("rejects ready on process error", async () => {
      const { proc, managed } = spawnWithMock();

      const assertion = expect(managed.ready).rejects.toThrow(
        NodeRedStartError,
      );
      proc.emit("error", new Error("spawn failed"));

      await assertion;
    });

    it("rejects ready on non-zero exit before ready", async () => {
      const { proc, managed } = spawnWithMock();

      const assertion = expect(managed.ready).rejects.toThrow(
        NodeRedStartError,
      );
      proc.emit("exit", 1);

      await assertion;
    });

    it("resolves ready on clean exit (code 0) before ready", async () => {
      const { proc, managed } = spawnWithMock();

      proc.emit("exit", 0);

      await expect(managed.ready).resolves.toBeUndefined();
    });

    it("detects the ready marker split across chunks", async () => {
      const { proc, managed } = spawnWithMock();

      proc.stdout.emit("data", Buffer.from("Started fl"));
      proc.stdout.emit("data", Buffer.from("ows\n"));

      await expect(managed.ready).resolves.toBeUndefined();
    });

    it("does not emit partial lines until the newline arrives", () => {
      const { proc, onLine } = spawnWithMock();

      proc.stdout.emit("data", Buffer.from("Loading pa"));
      expect(onLine).not.toHaveBeenCalled();

      proc.stdout.emit("data", Buffer.from("lette\n"));
      expect(onLine).toHaveBeenCalledWith("Loading palette", "stdout", false);
    });

    it("flushes a trailing partial line on exit", async () => {
      const { proc, managed, onLine } = spawnWithMock();

      proc.stdout.emit("data", Buffer.from("no trailing newline"));
      proc.emit("exit", 0);
      await managed.ready;

      expect(onLine).toHaveBeenCalledWith(
        "no trailing newline",
        "stdout",
        false,
      );
    });

    it("strips trailing carriage returns from lines", () => {
      const { proc, onLine } = spawnWithMock();

      proc.stdout.emit("data", Buffer.from("windows line\r\n"));

      expect(onLine).toHaveBeenCalledWith("windows line", "stdout", false);
    });

    it("resolves ready on signal exit (code null) before ready", async () => {
      const { proc, managed } = spawnWithMock();

      proc.emit("exit", null);

      await expect(managed.ready).resolves.toBeUndefined();
    });
  });

  describe("stop", () => {
    it("returns immediately when the child already exited", async () => {
      const proc = createMockProcess();
      proc.exitCode = 1;

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(treeKill).not.toHaveBeenCalled();
    });

    it("returns immediately when the child was killed by a signal", async () => {
      const proc = createMockProcess();
      proc.signalCode = "SIGKILL";

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(treeKill).not.toHaveBeenCalled();
    });

    it("sends SIGTERM via treeKill and waits for exit", async () => {
      const proc = createMockProcess();

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback();
          process.nextTick(() => proc.emit("exit", 0));
        },
      );

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(treeKill).toHaveBeenCalledWith(
        12345,
        "SIGTERM",
        expect.any(Function),
      );
    });

    it("falls back to process.kill when treeKill fails", async () => {
      const proc = createMockProcess();
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((() => true) as any);

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback(new Error("kill failed"));
          process.nextTick(() => proc.emit("exit", 0));
        },
      );

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
    });

    it("resolves when treeKill and process.kill both fail", async () => {
      const proc = createMockProcess();

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback(new Error("kill failed"));
        },
      );
      vi.spyOn(process, "kill").mockImplementation((() => {
        throw new Error("ESRCH");
      }) as any);

      await expect(
        nodeRedProcess.stop({ child: proc, pid: 12345, logger }),
      ).resolves.toBeUndefined();
    });

    it("force kills after graceful timeout", async () => {
      const proc = createMockProcess();

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, signal: any, callback?: any) => {
          // never emit exit for SIGTERM — force the timeout path
          if (signal === "SIGKILL" && callback) callback();
        },
      );

      await nodeRedProcess.stop({
        child: proc,
        pid: 12345,
        gracefulTimeoutMs: 10,
        logger,
      });

      expect(treeKill).toHaveBeenCalledWith(
        12345,
        "SIGKILL",
        expect.any(Function),
      );
    });
  });

  describe("kill", () => {
    it("sends SIGKILL via treeKill and resolves on callback", async () => {
      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback();
        },
      );

      await expect(nodeRedProcess.kill(12345)).resolves.toBeUndefined();

      expect(treeKill).toHaveBeenCalledWith(
        12345,
        "SIGKILL",
        expect.any(Function),
      );
    });
  });
  describe("acquirePort", () => {
    it("returns preferred port when available", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      const port = await nodeRedProcess.acquirePort({
        preferredPort: 1880,
        logger,
      });

      expect(port).toBe(1880);
      expect(detect).toHaveBeenCalledTimes(1);
      expect(getPort).not.toHaveBeenCalled();
    });

    it("retries and returns preferred port when freed after wait", async () => {
      vi.mocked<any>(detect)
        .mockResolvedValueOnce(1881)
        .mockResolvedValueOnce(1880);

      const port = await nodeRedProcess.acquirePort({
        preferredPort: 1880,
        retryDelay: 0,
        logger,
      });

      expect(port).toBe(1880);
      expect(detect).toHaveBeenCalledTimes(2);
      expect(getPort).not.toHaveBeenCalled();
    });

    it("falls back to a random port when preferred stays occupied", async () => {
      vi.mocked<any>(detect)
        .mockResolvedValueOnce(1881)
        .mockResolvedValueOnce(1881);
      vi.mocked<any>(getPort).mockResolvedValue(3456);

      const port = await nodeRedProcess.acquirePort({
        preferredPort: 1880,
        retryDelay: 0,
        logger,
      });

      expect(port).toBe(3456);
      expect(getPort).toHaveBeenCalledWith({ port: 1880 });
    });
  });

  describe("waitForPortRelease", () => {
    it("returns true when port is free", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      const released = await nodeRedProcess.waitForPortRelease(1880, {
        attempts: 3,
        delay: 0,
      });

      expect(released).toBe(true);
      expect(detect).toHaveBeenCalledTimes(1);
    });

    it("returns true when port frees up within attempts", async () => {
      vi.mocked<any>(detect)
        .mockResolvedValueOnce(1881)
        .mockResolvedValueOnce(1881)
        .mockResolvedValueOnce(1880);

      const released = await nodeRedProcess.waitForPortRelease(1880, {
        attempts: 5,
        delay: 0,
      });

      expect(released).toBe(true);
      expect(detect).toHaveBeenCalledTimes(3);
    });

    it("returns false when port never frees", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1881);

      const released = await nodeRedProcess.waitForPortRelease(1880, {
        attempts: 3,
        delay: 0,
      });

      expect(released).toBe(false);
      expect(detect).toHaveBeenCalledTimes(3);
    });
  });
});
