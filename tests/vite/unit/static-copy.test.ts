import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { staticCopy } from "@/vite/client/plugins/static-copy";

describe("static-copy", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function createTmpDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "static-copy-"));
    return tmpDir;
  }

  describe("plugin metadata", () => {
    it("has correct name", () => {
      const plugin = staticCopy({ targets: [] });
      expect(plugin.name).toBe("vite-plugin-node-red:client:static-copy");
    });

    it("applies to build", () => {
      const plugin = staticCopy({ targets: [] });
      expect(plugin.apply).toBe("build");
    });

    it("enforces post", () => {
      const plugin = staticCopy({ targets: [] });
      expect(plugin.enforce).toBe("post");
    });
  });

  describe("closeBundle", () => {
    it("copies a single file from a source directory", () => {
      const dir = createTmpDir();
      const srcDir = path.join(dir, "source");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "file.txt"), "hello", "utf-8");

      const destDir = path.join(dir, "out");

      const plugin = staticCopy({
        targets: [{ src: srcDir, dest: destDir }],
      });
      (plugin as any).closeBundle();

      expect(fs.existsSync(path.join(destDir, "file.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(destDir, "file.txt"), "utf-8")).toBe(
        "hello",
      );
    });

    it("copies a directory recursively (files + subdirectories)", () => {
      const dir = createTmpDir();
      const srcDir = path.join(dir, "source");
      const subDir = path.join(srcDir, "sub");
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "a.txt"), "a", "utf-8");
      fs.writeFileSync(path.join(subDir, "b.txt"), "b", "utf-8");

      const destDir = path.join(dir, "dest");

      const plugin = staticCopy({
        targets: [{ src: srcDir, dest: destDir }],
      });
      (plugin as any).closeBundle();

      expect(fs.existsSync(path.join(destDir, "a.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(destDir, "a.txt"), "utf-8")).toBe("a");
      expect(fs.existsSync(path.join(destDir, "sub", "b.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(destDir, "sub", "b.txt"), "utf-8")).toBe(
        "b",
      );
    });

    it("skips non-existent sources", () => {
      const dir = createTmpDir();
      const nonExistent = path.join(dir, "does-not-exist");
      const destDir = path.join(dir, "dest");

      const plugin = staticCopy({
        targets: [{ src: nonExistent, dest: destDir }],
      });

      // Should not throw
      expect(() => (plugin as any).closeBundle()).not.toThrow();
      expect(fs.existsSync(destDir)).toBe(false);
    });

    it("creates destination directories", () => {
      const dir = createTmpDir();
      const srcDir = path.join(dir, "source");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "file.txt"), "content", "utf-8");

      const deepDest = path.join(dir, "a", "b", "c");

      const plugin = staticCopy({
        targets: [{ src: srcDir, dest: deepDest }],
      });
      (plugin as any).closeBundle();

      expect(fs.existsSync(path.join(deepDest, "file.txt"))).toBe(true);
      expect(
        fs.readFileSync(path.join(deepDest, "file.txt"), "utf-8"),
      ).toBe("content");
    });

    it("copies multiple targets independently", () => {
      const dir = createTmpDir();
      const srcDir1 = path.join(dir, "source1");
      const srcDir2 = path.join(dir, "source2");
      fs.mkdirSync(srcDir1, { recursive: true });
      fs.mkdirSync(srcDir2, { recursive: true });
      fs.writeFileSync(path.join(srcDir1, "a.txt"), "a", "utf-8");
      fs.writeFileSync(path.join(srcDir2, "b.txt"), "b", "utf-8");

      const destDir1 = path.join(dir, "dest1");
      const destDir2 = path.join(dir, "dest2");

      const plugin = staticCopy({
        targets: [
          { src: srcDir1, dest: destDir1 },
          { src: srcDir2, dest: destDir2 },
        ],
      });
      (plugin as any).closeBundle();

      expect(fs.readFileSync(path.join(destDir1, "a.txt"), "utf-8")).toBe("a");
      expect(fs.readFileSync(path.join(destDir2, "b.txt"), "utf-8")).toBe("b");
    });
  });
});
