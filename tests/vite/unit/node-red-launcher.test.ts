import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import { NodeRedLauncher } from "@/vite/node-red-launcher";
import { NodeRedStartError } from "@/vite/errors";
import detect from "detect-port";
import getPort from "get-port";
import treeKill from "tree-kill";
import { build as esbuildBuild } from "esbuild";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

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

vi.mock("detect-port", () => ({ default: vi.fn() }));
vi.mock("get-port", () => ({ default: vi.fn() }));
vi.mock("tree-kill", () => ({ default: vi.fn() }));
vi.mock("esbuild", () => ({ build: vi.fn() }));

describe("NodeRedLauncher", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "nrg-launcher-test-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.mocked(detect).mockReset();
    vi.mocked(getPort).mockReset();
    vi.mocked(treeKill).mockReset();
    vi.mocked(spawn).mockReset();
    vi.mocked(execSync).mockReset();
    vi.mocked(esbuildBuild).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function installFakeNodeRed(
    opts: { bin?: string | Record<string, string>; version?: string } = {},
  ): string {
    const nodeRedDir = path.join(tmpDir, "node_modules", "node-red");
    fs.mkdirSync(nodeRedDir, { recursive: true });

    const binValue = opts.bin ?? { "node-red": "red.js" };
    const binFile =
      typeof binValue === "string" ? binValue : binValue["node-red"];

    const fullBinPath = path.join(nodeRedDir, binFile);
    fs.mkdirSync(path.dirname(fullBinPath), { recursive: true });
    fs.writeFileSync(fullBinPath, "// fake node-red");

    fs.writeFileSync(
      path.join(nodeRedDir, "package.json"),
      JSON.stringify({
        name: "node-red",
        version: opts.version ?? "4.0.0",
        bin: binValue,
      }),
    );

    return fullBinPath;
  }

  function mockNpxResolution(entryPoint: string): void {
    vi.mocked(execSync).mockReturnValue(entryPoint);
    const origExistsSync = fs.existsSync.bind(fs);
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (p === entryPoint) return true;
      return origExistsSync(p as string);
    });
  }

  function createMockProcess(pid: number = 12345) {
    const proc = new EventEmitter() as any;
    proc.pid = pid;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = null;
    proc.kill = vi.fn();
    return proc;
  }

  describe("nodeRedCommand", () => {
    it("returns 'node-red' when no version specified", () => {
      const launcher = new NodeRedLauncher("dist", {});
      expect(launcher.nodeRedCommand).toBe("node-red");
    });

    it("returns 'node-red@latest' when version is 'latest'", () => {
      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "latest" },
      });
      expect(launcher.nodeRedCommand).toBe("node-red@latest");
    });

    it("returns versioned command when specific version set", () => {
      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "5.0.0-beta.6" },
      });
      expect(launcher.nodeRedCommand).toBe("node-red@5.0.0-beta.6");
    });
  });

  describe("preferredPort", () => {
    it("defaults to 1880 when not configured", () => {
      const launcher = new NodeRedLauncher("dist", {});
      expect(launcher.preferredPort).toBe(1880);
    });

    it("returns configured port", () => {
      const launcher = new NodeRedLauncher("dist", {
        runtime: { port: 3000 },
      });
      expect(launcher.preferredPort).toBe(3000);
    });
  });

  describe("restartDelay", () => {
    it("defaults to 1000 when not configured", () => {
      const launcher = new NodeRedLauncher("dist", {});
      expect(launcher.restartDelay).toBe(1000);
    });

    it("returns configured delay", () => {
      const launcher = new NodeRedLauncher("dist", { restartDelay: 500 });
      expect(launcher.restartDelay).toBe(500);
    });
  });

  describe("pid", () => {
    it("returns null when no process", () => {
      const launcher = new NodeRedLauncher("dist", {});
      expect(launcher.pid).toBeNull();
    });

    it("returns process pid", () => {
      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).process = { pid: 42 };
      expect(launcher.pid).toBe(42);
    });
  });

  describe("resolveFromLocalNodeModules", () => {
    it("resolves when node-red is installed with object bin", () => {
      const expectedPath = installFakeNodeRed();
      const launcher = new NodeRedLauncher("dist", {});
      const result = (launcher as any).resolveFromLocalNodeModules();
      expect(result).toBe(expectedPath);
    });

    it("resolves when node-red has string bin field", () => {
      const expectedPath = installFakeNodeRed({ bin: "red.js" });
      const launcher = new NodeRedLauncher("dist", {});
      const result = (launcher as any).resolveFromLocalNodeModules();
      expect(result).toBe(expectedPath);
    });

    it("returns null when node-red is not installed", () => {
      const launcher = new NodeRedLauncher("dist", {});
      const result = (launcher as any).resolveFromLocalNodeModules();
      expect(result).toBeNull();
    });

    it("returns null when bin entry file does not exist on disk", () => {
      const nodeRedDir = path.join(tmpDir, "node_modules", "node-red");
      fs.mkdirSync(nodeRedDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeRedDir, "package.json"),
        JSON.stringify({
          name: "node-red",
          version: "4.0.0",
          bin: { "node-red": "nonexistent.js" },
        }),
      );

      const launcher = new NodeRedLauncher("dist", {});
      const result = (launcher as any).resolveFromLocalNodeModules();
      expect(result).toBeNull();
    });

    it("returns null when package.json has no bin field", () => {
      const nodeRedDir = path.join(tmpDir, "node_modules", "node-red");
      fs.mkdirSync(nodeRedDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeRedDir, "package.json"),
        JSON.stringify({ name: "node-red", version: "4.0.0" }),
      );

      const launcher = new NodeRedLauncher("dist", {});
      const result = (launcher as any).resolveFromLocalNodeModules();
      expect(result).toBeNull();
    });
  });

  describe("resolveNodeRedEntryPoint", () => {
    it("uses local node_modules when no runtime.version specified", () => {
      const expectedPath = installFakeNodeRed();
      const launcher = new NodeRedLauncher("dist", {});

      const result = (launcher as any).resolveNodeRedEntryPoint();

      expect(result).toBe(expectedPath);
      expect(execSync).not.toHaveBeenCalled();
    });

    it("tries local first when runtime.version is 'latest'", () => {
      const expectedPath = installFakeNodeRed();
      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "latest" },
      });

      const result = (launcher as any).resolveNodeRedEntryPoint();

      expect(result).toBe(expectedPath);
      expect(execSync).not.toHaveBeenCalled();
    });

    it("skips local and uses npx when runtime.version is set", () => {
      installFakeNodeRed();
      const npxEntry = "/tmp/npx-node-red/red.js";
      mockNpxResolution(npxEntry);

      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "5.0.0-beta.6" },
      });

      const result = (launcher as any).resolveNodeRedEntryPoint();

      expect(result).toBe(npxEntry);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("node-red@5.0.0-beta.6"),
        expect.any(Object),
      );
    });

    it("falls back to npx when not installed locally", () => {
      const npxEntry = "/tmp/npx-node-red/red.js";
      mockNpxResolution(npxEntry);

      const launcher = new NodeRedLauncher("dist", {});

      const result = (launcher as any).resolveNodeRedEntryPoint();

      expect(result).toBe(npxEntry);
      expect(execSync).toHaveBeenCalled();
    });

    it("throws NodeRedStartError when npx resolves empty entry", () => {
      vi.mocked(execSync).mockReturnValue("");

      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "5.0.0" },
      });

      expect(() => (launcher as any).resolveNodeRedEntryPoint()).toThrow(
        NodeRedStartError,
      );
    });

    it("throws NodeRedStartError when npx resolved path does not exist", () => {
      vi.mocked(execSync).mockReturnValue("/nonexistent/red.js");

      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "5.0.0" },
      });

      expect(() => (launcher as any).resolveNodeRedEntryPoint()).toThrow(
        NodeRedStartError,
      );
    });

    it("cleans up resolver script even when npx fails", () => {
      vi.mocked(execSync).mockReturnValue("");
      const unlinkSpy = vi.spyOn(fs, "unlinkSync");

      const launcher = new NodeRedLauncher("dist", {
        runtime: { version: "5.0.0" },
      });

      try {
        (launcher as any).resolveNodeRedEntryPoint();
      } catch {
        // expected
      }

      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("nrg-resolve-node-red-"),
      );
    });
  });

  describe("findRuntimeSettingsFilepath", () => {
    it("returns resolved path when user-provided file exists", () => {
      const settingsPath = path.join(tmpDir, "my-settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {
        runtime: { settingsFilepath: settingsPath },
      });

      expect((launcher as any).findRuntimeSettingsFilepath()).toBe(
        settingsPath,
      );
    });

    it("returns null when user-provided file does not exist", () => {
      const launcher = new NodeRedLauncher("dist", {
        runtime: { settingsFilepath: "/nonexistent/settings.ts" },
      });

      expect((launcher as any).findRuntimeSettingsFilepath()).toBeNull();
    });

    it("returns default node-red.settings.ts when it exists in cwd", () => {
      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {});

      expect((launcher as any).findRuntimeSettingsFilepath()).toBe(
        settingsPath,
      );
    });

    it("returns null when no settings file is found", () => {
      const launcher = new NodeRedLauncher("dist", {});
      expect((launcher as any).findRuntimeSettingsFilepath()).toBeNull();
    });
  });

  describe("compileRuntimeSettingsFile", () => {
    it("calls esbuild with correct options", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {});
      await (launcher as any).compileRuntimeSettingsFile(settingsPath);

      expect(esbuildBuild).toHaveBeenCalledWith(
        expect.objectContaining({
          entryPoints: [settingsPath],
          format: "cjs",
          platform: "node",
          target: "node18",
          bundle: true,
        }),
      );
    });

    it("stores compiled filepath", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {});
      const result = await (launcher as any).compileRuntimeSettingsFile(
        settingsPath,
      );

      expect((launcher as any).compiledRuntimeSettingsFilepath).toBe(result);
      expect(result).toMatch(/node-red\.settings\.\d+\.cjs$/);
    });

    it("externalizes node builtins and node-red", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {});
      await (launcher as any).compileRuntimeSettingsFile(settingsPath);

      const callArgs = vi.mocked(esbuildBuild).mock.calls[0][0];
      expect(callArgs.external).toEqual(
        expect.arrayContaining([
          "fs",
          "node:fs",
          "path",
          "node-red",
          "@node-red/*",
        ]),
      );
    });

    it("defines import.meta replacements", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {});
      await (launcher as any).compileRuntimeSettingsFile(settingsPath);

      const callArgs = vi.mocked(esbuildBuild).mock.calls[0][0];
      expect(callArgs.define!["import.meta.dirname"]).toBeDefined();
      expect(callArgs.define!["import.meta.filename"]).toBeDefined();
      expect(callArgs.define!["import.meta.url"]).toBeDefined();
    });
  });

  describe("generateRuntimeSettingsFile", () => {
    it("generates default settings when no user settings file exists", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).port = 1880;

      const result = await (launcher as any).generateRuntimeSettingsFile();

      try {
        expect(fs.existsSync(result)).toBe(true);
        const content = fs.readFileSync(result, "utf-8");
        expect(content).toContain("uiPort: 1880");
        expect(content).toContain("userDir:");
        expect(content).toContain('flowFile: "flows.json"');
        expect(content).toContain("nodesDir:");
        expect(content).not.toContain("require(");
      } finally {
        if (fs.existsSync(result)) fs.unlinkSync(result);
      }
    });

    it("generates settings with user config when settings file exists", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).port = 3000;

      const result = await (launcher as any).generateRuntimeSettingsFile();

      try {
        const content = fs.readFileSync(result, "utf-8");
        expect(content).toContain("require(");
        expect(content).toContain("settings.uiPort = 3000");
        expect(content).toContain("settings.nodesDir");
        expect(content).toContain("settings.userDir");
        expect(content).toContain("settings.flowFile");
      } finally {
        if (fs.existsSync(result)) fs.unlinkSync(result);
      }
    });

    it("stores final filepath in compiledRuntimeSettingsFilepath", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).port = 1880;

      const result = await (launcher as any).generateRuntimeSettingsFile();

      try {
        expect((launcher as any).compiledRuntimeSettingsFilepath).toBe(result);
      } finally {
        if (fs.existsSync(result)) fs.unlinkSync(result);
      }
    });
  });

  describe("log", () => {
    it("filters 'Server now running at' lines", () => {
      const launcher = new NodeRedLauncher("dist", {});
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      (launcher as any).log("Server now running at http://localhost:1880/");

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("passes other lines to logger.raw", () => {
      const launcher = new NodeRedLauncher("dist", {});
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      (launcher as any).log("Started flows");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Started flows"),
      );
    });
  });

  describe("flushLogs", () => {
    it("flushes buffered logs and clears buffer", () => {
      const launcher = new NodeRedLauncher("dist", {});
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      (launcher as any).bufferedLogs = ["line 1", "line 2"];
      launcher.flushLogs();

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect((launcher as any).bufferedLogs).toEqual([]);
    });

    it("handles empty buffer", () => {
      const launcher = new NodeRedLauncher("dist", {});
      launcher.flushLogs();
      expect((launcher as any).bufferedLogs).toEqual([]);
    });

    it("filters 'Server now running at' from buffered logs", () => {
      const launcher = new NodeRedLauncher("dist", {});
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      (launcher as any).bufferedLogs = [
        "Starting flows",
        "Server now running at http://localhost:1880/",
        "Started flows",
      ];
      launcher.flushLogs();

      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanup", () => {
    it("removes compiled settings file", () => {
      const tempFile = path.join(tmpDir, "test-settings.cjs");
      fs.writeFileSync(tempFile, "module.exports = {};");

      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).compiledRuntimeSettingsFilepath = tempFile;

      launcher.cleanup();

      expect(fs.existsSync(tempFile)).toBe(false);
      expect((launcher as any).compiledRuntimeSettingsFilepath).toBeNull();
    });

    it("does nothing when no filepath is set", () => {
      const launcher = new NodeRedLauncher("dist", {});
      launcher.cleanup();
      expect((launcher as any).compiledRuntimeSettingsFilepath).toBeNull();
    });

    it("does nothing when file does not exist", () => {
      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).compiledRuntimeSettingsFilepath =
        "/nonexistent/file.cjs";

      launcher.cleanup();

      expect((launcher as any).compiledRuntimeSettingsFilepath).toBe(
        "/nonexistent/file.cjs",
      );
    });
  });

  describe("start", () => {
    let launcher: InstanceType<typeof NodeRedLauncher>;

    beforeEach(() => {
      launcher = new NodeRedLauncher("dist", {});
      vi.spyOn(launcher as any, "resolveNodeRedEntryPoint").mockReturnValue(
        "/fake/red.js",
      );
      vi.spyOn(
        launcher as any,
        "generateRuntimeSettingsFile",
      ).mockResolvedValue("/tmp/settings.cjs");
    });

    it("starts on preferred port when available", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.stdout.emit("data", Buffer.from("Started flows\n"));
        });
        return proc as any;
      });

      const port = await launcher.start();
      expect(port).toBe(1880);
    });

    it("resolves on 'Server now running' output", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.stdout.emit(
            "data",
            Buffer.from("Server now running at http://localhost:1880/\n"),
          );
        });
        return proc as any;
      });

      const port = await launcher.start();
      expect(port).toBe(1880);
    });

    it("buffers stdout before ready", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.stdout.emit("data", Buffer.from("Loading palette\n"));
          proc.stdout.emit("data", Buffer.from("Started flows\n"));
        });
        return proc as any;
      });

      await launcher.start();
      expect((launcher as any).bufferedLogs).toContain("Loading palette");
    });

    it("buffers stderr before ready", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.stderr.emit("data", Buffer.from("some warning\n"));
          proc.stdout.emit("data", Buffer.from("Started flows\n"));
        });
        return proc as any;
      });

      await launcher.start();
      expect((launcher as any).bufferedLogs).toContain("some warning");
    });

    it("logs stdout directly after becoming ready", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.stdout.emit(
            "data",
            Buffer.from("Loading\nStarted flows\nAfter ready\n"),
          );
        });
        return proc as any;
      });

      await launcher.start();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("After ready"),
      );
    });

    it("throws NodeRedStartError on process error", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.emit("error", new Error("spawn failed"));
        });
        return proc as any;
      });

      await expect(launcher.start()).rejects.toThrow(NodeRedStartError);
    });

    it("throws on non-zero exit before ready", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.emit("exit", 1);
        });
        return proc as any;
      });

      await expect(launcher.start()).rejects.toThrow(NodeRedStartError);
    });

    it("resolves on clean exit (code 0) before ready", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.emit("exit", 0);
        });
        return proc as any;
      });

      const port = await launcher.start();
      expect(port).toBe(1880);
    });

    it("kills process on repeated failure", async () => {
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.emit("error", new Error("spawn failed"));
        });
        return proc as any;
      });

      try {
        await launcher.start();
      } catch {
        // expected
      }

      expect(treeKill).toHaveBeenCalledWith(12345, "SIGKILL");
    });

    it("retries port when initially occupied, uses preferred after wait", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked<any>(detect)
          .mockResolvedValueOnce(1881)
          .mockResolvedValueOnce(1880);

        vi.mocked(spawn).mockImplementation(() => {
          const proc = createMockProcess();
          queueMicrotask(() => {
            proc.stdout.emit("data", Buffer.from("Started flows\n"));
          });
          return proc as any;
        });

        const startPromise = launcher.start();
        await vi.advanceTimersByTimeAsync(2100);
        const port = await startPromise;

        expect(port).toBe(1880);
        expect(detect).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("falls back to random port when preferred port stays occupied", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked<any>(detect)
          .mockResolvedValueOnce(1881)
          .mockResolvedValueOnce(1881);
        vi.mocked<any>(getPort).mockResolvedValue(3456);

        vi.mocked(spawn).mockImplementation(() => {
          const proc = createMockProcess();
          queueMicrotask(() => {
            proc.stdout.emit("data", Buffer.from("Started flows\n"));
          });
          return proc as any;
        });

        const startPromise = launcher.start();
        await vi.advanceTimersByTimeAsync(2100);
        const port = await startPromise;

        expect(port).toBe(3456);
        expect(getPort).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("passes configured args to spawn", async () => {
      launcher = new NodeRedLauncher("dist", { args: ["--safe"] });
      vi.spyOn(launcher as any, "resolveNodeRedEntryPoint").mockReturnValue(
        "/fake/red.js",
      );
      vi.spyOn(
        launcher as any,
        "generateRuntimeSettingsFile",
      ).mockResolvedValue("/tmp/settings.cjs");
      vi.mocked<any>(detect).mockResolvedValue(1880);

      vi.mocked(spawn).mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.stdout.emit("data", Buffer.from("Started flows\n"));
        });
        return proc as any;
      });

      await launcher.start();

      expect(spawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(["--safe"]),
        expect.any(Object),
      );
    });
  });

  describe("stop", () => {
    it("returns immediately when no process", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      await launcher.stop();
      expect(treeKill).not.toHaveBeenCalled();
    });

    it("nullifies process when no pid", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      (launcher as any).process = { pid: undefined };

      await launcher.stop();

      expect((launcher as any).process).toBeNull();
      expect(treeKill).not.toHaveBeenCalled();
    });

    it("sends SIGTERM and waits for exit", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      const mockProc = createMockProcess();
      (launcher as any).process = mockProc;
      (launcher as any).port = 1880;

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback();
          process.nextTick(() => mockProc.emit("exit", 0));
        },
      );
      vi.mocked<any>(detect).mockResolvedValue(1880);

      await launcher.stop();

      expect(treeKill).toHaveBeenCalledWith(
        12345,
        "SIGTERM",
        expect.any(Function),
      );
      expect((launcher as any).process).toBeNull();
      expect((launcher as any).port).toBeNull();
    });

    it("skips port usage check when requested", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      const mockProc = createMockProcess();
      (launcher as any).process = mockProc;
      (launcher as any).port = 1880;

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback();
          process.nextTick(() => mockProc.emit("exit", 0));
        },
      );

      await launcher.stop(true);

      expect(detect).not.toHaveBeenCalled();
      expect((launcher as any).port).toBeNull();
    });

    it("resolves when treeKill and process.kill both fail", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      const mockProc = createMockProcess();
      (launcher as any).process = mockProc;
      (launcher as any).port = 1880;

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback(new Error("kill failed"));
        },
      );
      vi.spyOn(process, "kill").mockImplementation((() => {
        throw new Error("ESRCH");
      }) as any);

      await launcher.stop(true);

      expect((launcher as any).process).toBeNull();
      expect((launcher as any).port).toBeNull();
    });

    it("sets port to null even when no port was set", async () => {
      const launcher = new NodeRedLauncher("dist", {});
      const mockProc = createMockProcess();
      (launcher as any).process = mockProc;

      vi.mocked(treeKill).mockImplementation(
        (_pid: any, _signal: any, callback?: any) => {
          if (callback) callback();
          process.nextTick(() => mockProc.emit("exit", 0));
        },
      );

      await launcher.stop();

      expect((launcher as any).port).toBeNull();
    });

    it("force kills when port stays occupied after stop", async () => {
      vi.useFakeTimers();
      try {
        const launcher = new NodeRedLauncher("dist", {});
        const mockProc = createMockProcess();
        (launcher as any).process = mockProc;
        (launcher as any).port = 1880;

        vi.mocked(treeKill).mockImplementation(
          (_pid: any, _signal: any, callback?: any) => {
            if (callback) callback();
            queueMicrotask(() => mockProc.emit("exit", 0));
          },
        );
        vi.mocked<any>(detect).mockResolvedValue(1881);

        const stopPromise = launcher.stop();
        await vi.advanceTimersByTimeAsync(5000);
        await stopPromise;

        expect(treeKill).toHaveBeenCalledWith(
          12345,
          "SIGKILL",
          expect.any(Function),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
