import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn, execFile } from "child_process";
import { EventEmitter } from "events";
import detect from "detect-port";
import treeKill from "tree-kill";
import * as nodeRedProcess from "@/tools/vite/node-red-launcher/process";
import { NodeRedStartError } from "@/tools/vite/errors";
import { Logger } from "@/tools/vite/logger";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    spawn: vi.fn(),
    execFile: vi.fn(),
  };
});

vi.mock("tree-kill", () => ({ default: vi.fn() }));
vi.mock("detect-port", () => ({ default: vi.fn() }));

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
    vi.mocked(execFile).mockReset();
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
        {
          stdio: ["ignore", "pipe", "pipe"],
          detached: process.platform !== "win32",
        },
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
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(killSpy).not.toHaveBeenCalled();
    });

    it("returns immediately when the child was killed by a signal", async () => {
      const proc = createMockProcess();
      proc.signalCode = "SIGKILL";
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(killSpy).not.toHaveBeenCalled();
    });

    it("SIGTERMs the whole process group and waits for exit", async () => {
      const proc = createMockProcess();
      const killSpy = vi.spyOn(process, "kill").mockImplementation((() => {
        process.nextTick(() => proc.emit("exit", 0));
        return true;
      }) as any);

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      // negative pid targets the child's process group (spawned detached)
      expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");
    });

    it("falls back to the bare pid when the group signal fails", async () => {
      const proc = createMockProcess();
      const killSpy = vi.spyOn(process, "kill").mockImplementation(((
        pid: number,
      ) => {
        if (pid < 0) throw new Error("ESRCH");
        process.nextTick(() => proc.emit("exit", 0));
        return true;
      }) as any);

      await nodeRedProcess.stop({ child: proc, pid: 12345, logger });

      expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");
      expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
    });

    it("resolves without throwing when the signals fail", async () => {
      const proc = createMockProcess();
      vi.spyOn(process, "kill").mockImplementation((() => {
        throw new Error("ESRCH");
      }) as any);
      process.nextTick(() => proc.emit("exit", 0)); // already gone

      await expect(
        nodeRedProcess.stop({ child: proc, pid: 12345, logger }),
      ).resolves.toBeUndefined();
    });

    it("force-kills the group after the graceful timeout", async () => {
      const proc = createMockProcess();
      const signals: Array<[number, string]> = [];
      vi.spyOn(process, "kill").mockImplementation(((
        pid: number,
        sig: string,
      ) => {
        signals.push([pid, sig]);
        // only exit on the SIGKILL escalation, forcing the timeout path
        if (sig === "SIGKILL") process.nextTick(() => proc.emit("exit", 0));
        return true;
      }) as any);

      await nodeRedProcess.stop({
        child: proc,
        pid: 12345,
        gracefulTimeoutMs: 10,
        logger,
      });

      expect(signals).toContainEqual([-12345, "SIGKILL"]);
    });
  });

  describe("kill", () => {
    it("SIGKILLs the whole process group", async () => {
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);

      await expect(nodeRedProcess.kill(12345)).resolves.toBeUndefined();

      expect(killSpy).toHaveBeenCalledWith(-12345, "SIGKILL");
    });
  });

  describe("resolvePort", () => {
    // Drive the lsof/ps shell-outs run() makes: lsof → listening pids,
    // `ps -o command=` → command line, `ps -o ppid=` → parent pid.
    function mockShell(opts: {
      lsof?: string;
      command?: string;
      ppid?: string;
    }) {
      const { lsof = "", command = "", ppid = "" } = opts;
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        cb: any,
      ) => {
        if (cmd === "lsof") cb(null, lsof, "");
        else if (cmd === "ps" && args.includes("command="))
          cb(null, command, "");
        else if (cmd === "ps" && args.includes("ppid=")) cb(null, ppid, "");
        else cb(null, "", "");
        return {} as any;
      }) as any);
    }

    it("returns the start port when nothing is listening", async () => {
      mockShell({ lsof: "" });
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);

      const port = await nodeRedProcess.resolvePort({
        startPort: 1880,
      });

      expect(port).toBe(1880);
      expect(killSpy).not.toHaveBeenCalled();
    });

    it("reaps an abandoned nrg Node-RED (ppid 1) and reclaims the port", async () => {
      mockShell({
        lsof: "999\n",
        command: "node /x/red.js -s /tmp/node-red-settings-final-1-1880.cjs\n",
        ppid: "1\n",
      });
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);
      vi.mocked<any>(detect).mockResolvedValue(1880); // free after reap

      const port = await nodeRedProcess.resolvePort({
        startPort: 1880,
      });

      expect(port).toBe(1880);
      expect(killSpy).toHaveBeenCalledWith(-999, "SIGKILL");
    });

    it("advances past a LIVE sibling Node-RED without killing it", async () => {
      let lsofCalls = 0;
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        cb: any,
      ) => {
        if (cmd === "lsof") {
          lsofCalls++;
          cb(null, lsofCalls === 1 ? "888\n" : "", ""); // 1880 busy, 1881 free
        } else if (cmd === "ps" && args.includes("command=")) {
          cb(
            null,
            "node red.js -s /tmp/node-red-settings-final-9-1880.cjs\n",
            "",
          );
        } else if (cmd === "ps" && args.includes("ppid=")) {
          cb(null, "4321\n", ""); // live parent → not orphaned
        } else cb(null, "", "");
        return {} as any;
      }) as any);
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);

      const port = await nodeRedProcess.resolvePort({
        startPort: 1880,
      });

      expect(port).toBe(1881);
      expect(killSpy).not.toHaveBeenCalled();
    });

    it("advances past a foreign process without killing it", async () => {
      let lsofCalls = 0;
      vi.mocked(execFile).mockImplementation(((
        cmd: string,
        args: string[],
        cb: any,
      ) => {
        if (cmd === "lsof") {
          lsofCalls++;
          cb(null, lsofCalls === 1 ? "777\n" : "", "");
        } else if (cmd === "ps" && args.includes("command=")) {
          cb(null, "some-other-server --port 1880\n", ""); // not nrg
        } else if (cmd === "ps" && args.includes("ppid=")) {
          cb(null, "1\n", "");
        } else cb(null, "", "");
        return {} as any;
      }) as any);
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true as any);

      const port = await nodeRedProcess.resolvePort({
        startPort: 1880,
      });

      expect(port).toBe(1881);
      expect(killSpy).not.toHaveBeenCalled();
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
