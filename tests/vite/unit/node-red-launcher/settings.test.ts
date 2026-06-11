import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { build as esbuildBuild } from "esbuild";
import {
  findUserRuntimeSettingsFilepath,
  compileRuntimeSettingsFile,
  generateRuntimeSettings,
} from "@/vite/node-red-launcher/settings";
import { Logger } from "@/vite/logger";

vi.mock("esbuild", () => ({ build: vi.fn() }));

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

describe("node-red-launcher/settings", () => {
  let tmpDir: string;
  let logger: Logger;
  const createdFiles: string[] = [];

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "nrg-settings-test-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.mocked(esbuildBuild).mockReset();
    logger = new Logger({ name: "test", prefix: "node-red" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const file of createdFiles.splice(0)) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  describe("findUserRuntimeSettingsFilepath", () => {
    it("returns resolved path when user-provided file exists", () => {
      const settingsPath = path.join(tmpDir, "my-settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      expect(findUserRuntimeSettingsFilepath(settingsPath, logger)).toBe(
        settingsPath,
      );
    });

    it("returns null when user-provided file does not exist", () => {
      expect(
        findUserRuntimeSettingsFilepath("/nonexistent/settings.ts", logger),
      ).toBeNull();
    });

    it("returns default node-red.settings.ts when it exists in cwd", () => {
      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      expect(findUserRuntimeSettingsFilepath(undefined, logger)).toBe(
        settingsPath,
      );
    });

    it("returns null when no settings file is found", () => {
      expect(findUserRuntimeSettingsFilepath(undefined, logger)).toBeNull();
    });
  });

  describe("compileRuntimeSettingsFile", () => {
    it("calls esbuild with correct options", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      await compileRuntimeSettingsFile(settingsPath, 1880);

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

    it("returns the compiled filepath", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const result = await compileRuntimeSettingsFile(settingsPath, 1880);

      expect(result).toMatch(/node-red\.settings\.\d+-1880\.cjs$/);
    });

    it("externalizes node builtins and node-red", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      await compileRuntimeSettingsFile(settingsPath, 1880);

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

      await compileRuntimeSettingsFile(settingsPath, 1880);

      const callArgs = vi.mocked(esbuildBuild).mock.calls[0][0];
      expect(callArgs.define!["import.meta.dirname"]).toBeDefined();
      expect(callArgs.define!["import.meta.filename"]).toBeDefined();
      expect(callArgs.define!["import.meta.url"]).toBeDefined();
    });
  });

  describe("generateRuntimeSettings", () => {
    it("generates default settings when no user settings file exists", async () => {
      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        logger,
      });
      createdFiles.push(...result.tempFiles);

      expect(fs.existsSync(result.filepath)).toBe(true);
      const content = fs.readFileSync(result.filepath, "utf-8");
      expect(content).toContain("uiPort: 1880");
      expect(content).toContain("userDir:");
      expect(content).toContain('flowFile: "flows.json"');
      expect(content).toContain("nodesDir:");
      expect(content).not.toContain("require(");
    });

    it("mounts the editor under httpAdminRoot in default settings", async () => {
      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        httpAdminRoot: "/my-app/",
        logger,
      });
      createdFiles.push(...result.tempFiles);

      const content = fs.readFileSync(result.filepath, "utf-8");
      expect(content).toContain('httpAdminRoot: "/my-app/"');

      const moduleStub: { exports: Record<string, any> } = { exports: {} };
      new Function("module", "require", content)(moduleStub, () => ({}));
      expect(moduleStub.exports.httpAdminRoot).toBe("/my-app/");
      expect(moduleStub.exports.uiPort).toBe(1880);
    });

    it("omits httpAdminRoot from default settings when not provided", async () => {
      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        logger,
      });
      createdFiles.push(...result.tempFiles);

      const content = fs.readFileSync(result.filepath, "utf-8");
      expect(content).not.toContain("httpAdminRoot");
    });

    it("sets httpAdminRoot on user settings when provided", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);
      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        httpAdminRoot: "/my-app/",
        logger,
      });
      createdFiles.push(...result.tempFiles);

      const content = fs.readFileSync(result.filepath, "utf-8");
      expect(content).toContain('settings.httpAdminRoot = "/my-app/"');
    });

    it("generates settings with user config when settings file exists", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 3000,
        logger,
      });
      createdFiles.push(...result.tempFiles);

      const content = fs.readFileSync(result.filepath, "utf-8");
      expect(content).toContain("require(");
      expect(content).toContain("settings.uiPort = 3000");
      expect(content).toContain("settings.nodesDir");
      expect(content).toContain("settings.userDir");
      expect(content).toContain("settings.flowFile");
    });

    it("escapes special characters in embedded paths", async () => {
      const weirdDir = path.join(tmpDir, 'we"ird');
      fs.mkdirSync(weirdDir);
      vi.spyOn(process, "cwd").mockReturnValue(weirdDir);

      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        logger,
      });
      createdFiles.push(...result.tempFiles);

      const content = fs.readFileSync(result.filepath, "utf-8");
      const moduleStub: { exports: Record<string, any> } = { exports: {} };
      new Function("module", "require", content)(moduleStub, () => ({}));

      expect(moduleStub.exports.userDir).toContain('we"ird');
      expect(moduleStub.exports.uiPort).toBe(1880);
    });

    it("tracks only the final file when no user settings file exists", async () => {
      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        logger,
      });
      createdFiles.push(...result.tempFiles);

      expect(result.tempFiles).toEqual([result.filepath]);
    });

    it("tracks the intermediate compiled file for cleanup", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      const result = await generateRuntimeSettings({
        outDir: "dist",
        port: 1880,
        logger,
      });
      createdFiles.push(...result.tempFiles);

      expect(result.tempFiles).toHaveLength(2);
      expect(result.tempFiles[0]).toMatch(/node-red\.settings\.\d+-1880\.cjs$/);
      expect(result.tempFiles[1]).toBe(result.filepath);
    });
  });
});
