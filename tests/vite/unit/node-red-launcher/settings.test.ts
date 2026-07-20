import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { build as esbuildBuild } from "esbuild";
import {
  findUserRuntimeSettingsFilepath,
  compileRuntimeSettingsFile,
  generateRuntimeSettings,
} from "@/tools/vite/node-red-launcher/settings";
import { Logger } from "@/tools/vite/logger";

vi.mock("esbuild", () => ({ build: vi.fn() }));

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

    // A `node-red.settings.ts` imports `defineNodeRedSettings` from
    // `@bonsae/nrg/vite`, but this file is bundled into Node-RED's runtime
    // settings — resolving the full plugin entry would drag the dev toolchain's
    // native deps (chokidar→fsevents, vite→lightningcss) into the bundle and
    // break the launch. The compiler must redirect that import to nrg's
    // dependency-free settings-helper leaf.
    function scaffoldInstalledNrg(withLeaf: boolean): string {
      const viteDir = path.join(
        tmpDir,
        "node_modules",
        "@bonsae",
        "nrg",
        "vite",
      );
      fs.mkdirSync(viteDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "node_modules", "@bonsae", "nrg", "package.json"),
        JSON.stringify({
          name: "@bonsae/nrg",
          exports: { "./vite": "./vite/index.js" },
        }),
      );
      fs.writeFileSync(
        path.join(viteDir, "index.js"),
        "export const nrg = () => {};",
      );
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "c" }),
      );
      const leaf = path.join(viteDir, "node-red-settings.js");
      if (withLeaf) {
        fs.writeFileSync(
          leaf,
          "export const defineNodeRedSettings = (s) => s;",
        );
      }
      return leaf;
    }

    it("redirects @bonsae/nrg/vite to the settings-helper leaf", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);
      const leaf = scaffoldInstalledNrg(true);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(
        settingsPath,
        'import { defineNodeRedSettings } from "@bonsae/nrg/vite";\n' +
          "export default defineNodeRedSettings({});",
      );

      await compileRuntimeSettingsFile(settingsPath, 1880);

      const callArgs = vi.mocked(esbuildBuild).mock.calls[0][0];
      expect(callArgs.plugins).toHaveLength(1);

      // Invoking the plugin's onResolve confirms the redirect target.
      let resolved: unknown;
      const fakeBuild = {
        onResolve: (_opts: unknown, cb: (a: { path: string }) => unknown) => {
          resolved = cb({ path: "@bonsae/nrg/vite" });
        },
      };
      callArgs.plugins![0].setup(fakeBuild as never);
      expect(resolved).toEqual({ path: leaf });
    });

    it("registers no redirect when the installed nrg predates the leaf", async () => {
      vi.mocked(esbuildBuild).mockResolvedValue({} as any);
      scaffoldInstalledNrg(false);

      const settingsPath = path.join(tmpDir, "node-red.settings.ts");
      fs.writeFileSync(settingsPath, "export default {};");

      await compileRuntimeSettingsFile(settingsPath, 1880);

      const callArgs = vi.mocked(esbuildBuild).mock.calls[0][0];
      expect(callArgs.plugins).toEqual([]);
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
