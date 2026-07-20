import { describe, it, expect } from "vitest";
import { minifier } from "@/tools/vite/client/plugins/minifier";

describe("minifier", () => {
  function getPlugin() {
    return minifier();
  }

  describe("plugin metadata", () => {
    it("has correct name", () => {
      const plugin = getPlugin();
      expect(plugin.name).toBe("vite-plugin-nrg:client:minifier");
    });

    it("applies to build", () => {
      const plugin = getPlugin();
      expect(plugin.apply).toBe("build");
    });
  });

  describe("generateBundle", () => {
    it("minifies JavaScript chunks (code gets shorter)", async () => {
      const plugin = getPlugin();
      const originalCode = `
        function helloWorld() {
          const message = "hello";
          const greeting = "world";
          console.log(message + " " + greeting);
          return message;
        }
      `;
      const bundle: Record<string, any> = {
        "main.js": { type: "chunk", code: originalCode },
      };

      await (plugin as any).generateBundle.call({}, {}, bundle);

      expect(bundle["main.js"].code.length).toBeLessThan(originalCode.length);
    });

    it("skips non-JS files", async () => {
      const plugin = getPlugin();
      const cssSource = "body { color: red; }";
      const bundle: Record<string, any> = {
        "style.css": { type: "chunk", code: cssSource },
      };

      await (plugin as any).generateBundle.call({}, {}, bundle);

      // CSS chunk should remain unchanged since it doesn't end with .js
      expect(bundle["style.css"].code).toBe(cssSource);
    });

    it("skips asset-type bundles (only processes chunks)", async () => {
      const plugin = getPlugin();
      const assetSource = "console.log('asset')";
      const bundle: Record<string, any> = {
        "asset.js": { type: "asset", source: assetSource },
      };

      await (plugin as any).generateBundle.call({}, {}, bundle);

      // Asset type should remain unchanged
      expect(bundle["asset.js"].source).toBe(assetSource);
    });

    it("sets map to null after minification", async () => {
      const plugin = getPlugin();
      const bundle: Record<string, any> = {
        "main.js": {
          type: "chunk",
          code: "const x = 1; console.log(x);",
          map: { mappings: "AAAA" },
        },
      };

      await (plugin as any).generateBundle.call({}, {}, bundle);

      expect(bundle["main.js"].map).toBeNull();
    });
  });
});
