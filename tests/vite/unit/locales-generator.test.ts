import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { localesGenerator } from "@/tools/vite/client/plugins/locales-generator";

describe("locales-generator", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function createTmpDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locales-gen-"));
    return tmpDir;
  }

  function setupDirs(base: string) {
    const outDir = path.join(base, "out");
    const docsDir = path.join(base, "docs");
    const labelsDir = path.join(base, "labels");
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(labelsDir, { recursive: true });
    return { outDir, docsDir, labelsDir };
  }

  describe("plugin metadata", () => {
    it("has correct name", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);
      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      expect(plugin.name).toBe("vite-plugin-node-red:client:locales-generator");
    });

    it("applies to build", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);
      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      expect(plugin.apply).toBe("build");
    });

    it("enforces post", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);
      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      expect(plugin.enforce).toBe("post");
    });
  });

  describe("closeBundle", () => {
    it("processes .html doc files into index.html with script tags", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeDocsDir = path.join(docsDir, "my-node");
      fs.mkdirSync(nodeDocsDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeDocsDir, "en-US.html"),
        "<p>Help text</p>",
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      const output = fs.readFileSync(
        path.join(outDir, "en-US", "index.html"),
        "utf-8",
      );
      expect(output).toContain(
        '<script type="text/html" data-help-name="my-node">',
      );
      expect(output).toContain("<p>Help text</p>");
      expect(output).toContain("</script>");
    });

    it("processes .md doc files with text/markdown type", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeDocsDir = path.join(docsDir, "my-node");
      fs.mkdirSync(nodeDocsDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeDocsDir, "en-US.md"),
        "# Help\nSome markdown",
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      const output = fs.readFileSync(
        path.join(outDir, "en-US", "index.html"),
        "utf-8",
      );
      expect(output).toContain(
        '<script type="text/markdown" data-help-name="my-node">',
      );
      expect(output).toContain("# Help\nSome markdown");
    });

    it("processes .json label files into index.json", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeLabelsDir = path.join(labelsDir, "my-node");
      fs.mkdirSync(nodeLabelsDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeLabelsDir, "en-US.json"),
        JSON.stringify({ configs: { host: "Host" } }),
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      const output = JSON.parse(
        fs.readFileSync(path.join(outDir, "en-US", "index.json"), "utf-8"),
      );
      expect(output["my-node"]).toBeDefined();
      expect(output["my-node"].configs.host).toBe("Host");
    });

    it("merges framework labels as defaults (user labels override)", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeLabelsDir = path.join(labelsDir, "my-node");
      fs.mkdirSync(nodeLabelsDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeLabelsDir, "en-US.json"),
        JSON.stringify({ configs: { name: "Custom Name", host: "Host" } }),
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      const output = JSON.parse(
        fs.readFileSync(path.join(outDir, "en-US", "index.json"), "utf-8"),
      );
      // User override wins
      expect(output["my-node"].configs.name).toBe("Custom Name");
      // User-provided key preserved
      expect(output["my-node"].configs.host).toBe("Host");
      // Framework default injected
      expect(output["my-node"].toggles).toBeDefined();
      expect(output["my-node"].toggles.validateInput).toBe("Validate Data");
    });

    it("falls back to en-US framework labels for unknown languages", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeLabelsDir = path.join(labelsDir, "my-node");
      fs.mkdirSync(nodeLabelsDir, { recursive: true });
      // ja is a supported language but let's test framework label injection for it
      fs.writeFileSync(
        path.join(nodeLabelsDir, "ja.json"),
        JSON.stringify({ configs: { host: "Host" } }),
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      const output = JSON.parse(
        fs.readFileSync(path.join(outDir, "ja", "index.json"), "utf-8"),
      );
      // Should have ja framework labels
      expect(output["my-node"].configs.name).toBe("名前");
      expect(output["my-node"].toggles.validateInput).toBe("データを検証");
    });

    it("throws on invalid language codes", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeLabelsDir = path.join(labelsDir, "my-node");
      fs.mkdirSync(nodeLabelsDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeLabelsDir, "invalid-lang.json"),
        JSON.stringify({ configs: { host: "Host" } }),
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      expect(() => (plugin as any).closeBundle()).toThrow(
        /Invalid language "invalid-lang"/,
      );
    });

    it("handles missing docsDir gracefully", () => {
      const base = createTmpDir();
      const outDir = path.join(base, "out");
      const docsDir = path.join(base, "nonexistent-docs");
      const labelsDir = path.join(base, "labels");
      fs.mkdirSync(outDir, { recursive: true });
      fs.mkdirSync(labelsDir, { recursive: true });

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      expect(() => (plugin as any).closeBundle()).not.toThrow();
    });

    it("handles missing labelsDir gracefully", () => {
      const base = createTmpDir();
      const outDir = path.join(base, "out");
      const docsDir = path.join(base, "docs");
      const labelsDir = path.join(base, "nonexistent-labels");
      fs.mkdirSync(outDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      expect(() => (plugin as any).closeBundle()).not.toThrow();
    });

    it("outputs per-language directories", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeDocsDir = path.join(docsDir, "my-node");
      fs.mkdirSync(nodeDocsDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeDocsDir, "en-US.html"),
        "<p>English</p>",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(nodeDocsDir, "de.html"),
        "<p>Deutsch</p>",
        "utf-8",
      );

      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      expect(fs.existsSync(path.join(outDir, "en-US", "index.html"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(outDir, "de", "index.html"))).toBe(true);
    });

    it("warns on nested label format", () => {
      const base = createTmpDir();
      const { outDir, docsDir, labelsDir } = setupDirs(base);

      const nodeLabelsDir = path.join(labelsDir, "my-node");
      fs.mkdirSync(nodeLabelsDir, { recursive: true });
      // Nested format: root key matches node type
      fs.writeFileSync(
        path.join(nodeLabelsDir, "en-US.json"),
        JSON.stringify({ "my-node": { configs: { host: "Host" } } }),
        "utf-8",
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const plugin = localesGenerator({ outDir, docsDir, labelsDir });
      (plugin as any).closeBundle();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("uses nested format"),
      );
      warnSpy.mockRestore();
    });
  });
});
