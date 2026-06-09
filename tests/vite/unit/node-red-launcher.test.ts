import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { NodeRedLauncher } from "@/vite/node-red-launcher";
import { NodeRedStartError } from "@/vite/errors";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    execSync: vi.fn(),
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

describe("NodeRedLauncher", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "nrg-launcher-test-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
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
});
