import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getNodeRedCommand,
  resolveNodeRedFromLocalNodeModules,
  resolveNodeRed,
} from "@/vite/node-red-launcher/entry-point";
import { NodeRedStartError } from "@/vite/errors";
import { Logger } from "@/vite/logger";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    exec: vi.fn(),
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

describe("node-red-launcher/entry-point", () => {
  let tmpDir: string;
  let logger: Logger;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "nrg-resolve-test-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.mocked(exec).mockReset();
    logger = new Logger({ name: "test", prefix: "node-red" });
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

  function mockNpxOutput(stdout: string): void {
    vi.mocked(exec).mockImplementation(((
      _cmd: any,
      _opts: any,
      callback: any,
    ) => {
      callback(null, stdout, "");
      return undefined as any;
    }) as any);
  }

  function mockNpxResolution(entryPoint: string): void {
    mockNpxOutput(entryPoint);
    const origExistsSync = fs.existsSync.bind(fs);
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      if (p === entryPoint) return true;
      return origExistsSync(p as string);
    });
  }

  describe("getNodeRedCommand", () => {
    it("returns 'node-red' when no version specified", () => {
      expect(getNodeRedCommand()).toBe("node-red");
    });

    it("returns 'node-red@latest' when version is 'latest'", () => {
      expect(getNodeRedCommand("latest")).toBe("node-red@latest");
    });

    it("returns versioned command when specific version set", () => {
      expect(getNodeRedCommand("5.0.0-beta.6")).toBe("node-red@5.0.0-beta.6");
    });
  });

  describe("resolveNodeRedFromLocalNodeModules", () => {
    it("resolves when node-red is installed with object bin", () => {
      const expectedPath = installFakeNodeRed();
      expect(resolveNodeRedFromLocalNodeModules()).toBe(expectedPath);
    });

    it("resolves when node-red has string bin field", () => {
      const expectedPath = installFakeNodeRed({ bin: "red.js" });
      expect(resolveNodeRedFromLocalNodeModules()).toBe(expectedPath);
    });

    it("returns null when node-red is not installed", () => {
      expect(resolveNodeRedFromLocalNodeModules()).toBeNull();
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

      expect(resolveNodeRedFromLocalNodeModules()).toBeNull();
    });

    it("returns null when package.json has no bin field", () => {
      const nodeRedDir = path.join(tmpDir, "node_modules", "node-red");
      fs.mkdirSync(nodeRedDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeRedDir, "package.json"),
        JSON.stringify({ name: "node-red", version: "4.0.0" }),
      );

      expect(resolveNodeRedFromLocalNodeModules()).toBeNull();
    });
  });

  describe("resolveNodeRed", () => {
    it("uses local node_modules when no version specified", async () => {
      const expectedPath = installFakeNodeRed();

      const result = await resolveNodeRed({ logger });

      expect(result).toBe(expectedPath);
      expect(exec).not.toHaveBeenCalled();
    });

    it("tries local first when version is 'latest'", async () => {
      const expectedPath = installFakeNodeRed();

      const result = await resolveNodeRed({
        version: "latest",
        logger,
      });

      expect(result).toBe(expectedPath);
      expect(exec).not.toHaveBeenCalled();
    });

    it("skips local and uses npx when explicit version is set", async () => {
      installFakeNodeRed();
      const npxEntry = "/tmp/npx-node-red/red.js";
      mockNpxResolution(npxEntry);

      const result = await resolveNodeRed({
        version: "5.0.0-beta.6",
        logger,
      });

      expect(result).toBe(npxEntry);
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining("node-red@5.0.0-beta.6"),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("falls back to npx when not installed locally", async () => {
      const npxEntry = "/tmp/npx-node-red/red.js";
      mockNpxResolution(npxEntry);

      const result = await resolveNodeRed({ logger });

      expect(result).toBe(npxEntry);
      expect(exec).toHaveBeenCalled();
    });

    it("passes npxTimeoutMs to exec", async () => {
      const npxEntry = "/tmp/npx-node-red/red.js";
      mockNpxResolution(npxEntry);

      await resolveNodeRed({
        version: "5.0.0",
        npxTimeoutMs: 42,
        logger,
      });

      expect(exec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 42 }),
        expect.any(Function),
      );
    });

    it("quotes the resolver script path in the npx command", async () => {
      const npxEntry = "/tmp/npx-node-red/red.js";
      mockNpxResolution(npxEntry);

      await resolveNodeRed({ version: "5.0.0", logger });

      const command = vi.mocked(exec).mock.calls[0][0] as string;
      expect(command).toMatch(/node "[^"]*nrg-resolve-node-red-[^"]*\.cjs"$/);
    });

    it("rejects versions containing shell metacharacters", async () => {
      await expect(
        resolveNodeRed({ version: "5.0.0; rm -rf /", logger }),
      ).rejects.toThrow(NodeRedStartError);

      expect(exec).not.toHaveBeenCalled();
    });

    it("rejects when the npx command fails", async () => {
      vi.mocked(exec).mockImplementation(((
        _cmd: any,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("npx failed"), "", "");
        return undefined as any;
      }) as any);

      await expect(
        resolveNodeRed({ version: "5.0.0", logger }),
      ).rejects.toThrow("npx failed");
    });

    it("throws NodeRedStartError when npx resolves empty entry", async () => {
      mockNpxOutput("");

      await expect(
        resolveNodeRed({ version: "5.0.0", logger }),
      ).rejects.toThrow(NodeRedStartError);
    });

    it("throws NodeRedStartError when npx resolved path does not exist", async () => {
      mockNpxOutput("/nonexistent/red.js");

      await expect(
        resolveNodeRed({ version: "5.0.0", logger }),
      ).rejects.toThrow(NodeRedStartError);
    });

    it("cleans up resolver script even when npx fails", async () => {
      mockNpxOutput("");
      const unlinkSpy = vi.spyOn(fs, "unlinkSync");

      try {
        await resolveNodeRed({ version: "5.0.0", logger });
      } catch {
        // expected
      }

      expect(unlinkSpy).toHaveBeenCalledWith(
        expect.stringContaining("nrg-resolve-node-red-"),
      );
    });
  });
});
