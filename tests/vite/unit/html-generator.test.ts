import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { htmlGenerator } from "@/vite/client/plugins/html-generator";

describe("html-generator", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function getPlugin(options: { packageName: string; licensePath?: string }) {
    return htmlGenerator(options);
  }

  describe("plugin metadata", () => {
    it("has correct name", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      expect(plugin.name).toBe("vite-plugin-node-red:client:html-generator");
    });

    it("applies to build", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      expect(plugin.apply).toBe("build");
    });

    it("enforces post", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      expect(plugin.enforce).toBe("post");
    });
  });

  describe("generateBundle", () => {
    it("generates <script> tag for .js files with correct src path", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/main.js": { type: "chunk" as const, code: "console.log(1)" },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).toContain(
        '<script type="module" src="resources/my-package/main.js" defer></script>',
      );
    });

    it('generates <link rel="stylesheet"> for .css files', () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/style.css": { type: "asset" as const, source: "body{}" },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).toContain(
        '<link rel="stylesheet" href="resources/my-package/style.css">',
      );
    });

    it('generates <link rel="preload" as="font"> for font files', () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/font.woff2": {
          type: "asset" as const,
          source: new Uint8Array([0]),
        },
        "resources/font.ttf": {
          type: "asset" as const,
          source: new Uint8Array([0]),
        },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).toContain(
        '<link rel="preload" as="font" href="resources/my-package/font.woff2"',
      );
      expect(emitted.source).toContain(
        '<link rel="preload" as="font" href="resources/my-package/font.ttf"',
      );
    });

    it("returns null (filtered out) for unknown MIME types", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/image.png": {
          type: "asset" as const,
          source: new Uint8Array([0]),
        },
        "resources/main.js.map": {
          type: "asset" as const,
          source: "{}",
        },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).not.toContain("image.png");
      expect(emitted.source).not.toContain("main.js.map");
    });

    it("includes license banner when licensePath exists", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-gen-"));
      const licensePath = path.join(tmpDir, "LICENSE");
      fs.writeFileSync(licensePath, "MIT License\nCopyright 2024", "utf-8");

      const plugin = getPlugin({ packageName: "my-package", licensePath });
      const emitFile = vi.fn();
      const bundle = {
        "resources/main.js": { type: "chunk" as const, code: "code" },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).toContain("<!--");
      expect(emitted.source).toContain("MIT License");
      expect(emitted.source).toContain("Copyright 2024");
      expect(emitted.source).toContain("-->");
    });

    it("omits license banner when licensePath is not provided", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/main.js": { type: "chunk" as const, code: "code" },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).not.toContain("<!--");
    });

    it("emits an index.html asset via this.emitFile", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/main.js": { type: "chunk" as const, code: "code" },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      expect(emitFile).toHaveBeenCalledOnce();
      expect(emitFile).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "asset",
          fileName: "index.html",
        }),
      );
    });

    it("handles chunk type vs asset type for content detection", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/chunk.js": { type: "chunk" as const, code: "chunk code" },
        "resources/asset.css": {
          type: "asset" as const,
          source: "asset content",
        },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      expect(emitted.source).toContain("chunk.js");
      expect(emitted.source).toContain("asset.css");
    });

    it("strips resources/ prefix from bundle filenames to avoid duplication", () => {
      const plugin = getPlugin({ packageName: "my-package" });
      const emitFile = vi.fn();
      const bundle = {
        "resources/main.js": { type: "chunk" as const, code: "code" },
      };

      (plugin as any).generateBundle.call({ emitFile }, {}, bundle);

      const emitted = emitFile.mock.calls[0][0];
      // Should be resources/my-package/main.js, NOT resources/my-package/resources/main.js
      expect(emitted.source).toContain("resources/my-package/main.js");
      expect(emitted.source).not.toContain(
        "resources/my-package/resources/main.js",
      );
    });
  });
});
