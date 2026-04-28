import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { mergeOptions, cleanDir, copyFiles, getPackageName } from "../../../src/vite/utils";

describe("mergeOptions", () => {
  it("should return a copy of defaults when no overrides", () => {
    const defaults = { a: 1, b: "hello" };
    const result = mergeOptions(defaults);
    expect(result).toEqual(defaults);
    expect(result).not.toBe(defaults);
  });

  it("should return a copy of defaults when overrides is undefined", () => {
    const defaults = { a: 1 };
    const result = mergeOptions(defaults, undefined);
    expect(result).toEqual({ a: 1 });
  });

  it("should override primitive values", () => {
    const defaults = { a: 1, b: "hello" };
    const result = mergeOptions(defaults, { a: 2 });
    expect(result).toEqual({ a: 2, b: "hello" });
  });

  it("should deep merge nested objects", () => {
    const defaults = {
      server: { port: 1880, host: "localhost" },
      client: { entry: "index.ts" },
    };
    const result = mergeOptions(defaults, {
      server: { port: 3000 } as any,
    });
    expect(result.server).toEqual({ port: 3000, host: "localhost" });
    expect(result.client).toEqual({ entry: "index.ts" });
  });

  it("should replace arrays entirely (no merging)", () => {
    const defaults = { tags: ["a", "b", "c"] };
    const result = mergeOptions(defaults, { tags: ["x"] } as any);
    expect(result.tags).toEqual(["x"]);
  });

  it("should not override with undefined values", () => {
    const defaults = { a: 1, b: 2 };
    const result = mergeOptions(defaults, { a: undefined } as any);
    expect(result.a).toBe(1);
  });

  it("should handle null override values", () => {
    const defaults = { a: { nested: true } };
    const result = mergeOptions(defaults, { a: null } as any);
    expect(result.a).toBeNull();
  });

  it("should handle deeply nested merges", () => {
    const defaults = {
      level1: {
        level2: {
          level3: { value: "original" },
        },
      },
    };
    const result = mergeOptions(defaults, {
      level1: {
        level2: {
          level3: { value: "changed" },
        } as any,
      } as any,
    });
    expect(result.level1.level2.level3.value).toBe("changed");
  });
});

describe("cleanDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-test-clean-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("should remove existing directory contents and recreate it", () => {
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "content");

    cleanDir(tmpDir);

    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it("should create directory if it does not exist", () => {
    const newDir = path.join(tmpDir, "new-subdir");
    expect(fs.existsSync(newDir)).toBe(false);

    cleanDir(newDir);

    expect(fs.existsSync(newDir)).toBe(true);
  });

  it("should handle nested directories", () => {
    const nested = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "file.txt"), "data");

    cleanDir(tmpDir);

    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });
});

describe("copyFiles", () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-test-copy-src-"));
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-test-copy-dest-"));
  });

  afterEach(() => {
    if (fs.existsSync(srcDir)) fs.rmSync(srcDir, { recursive: true });
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
  });

  it("should copy a single file", () => {
    const srcFile = path.join(srcDir, "test.txt");
    fs.writeFileSync(srcFile, "hello");

    copyFiles([{ src: srcFile, dest: "test.txt" }], destDir);

    const destFile = path.join(destDir, "test.txt");
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.readFileSync(destFile, "utf-8")).toBe("hello");
  });

  it("should copy a directory recursively", () => {
    const subDir = path.join(srcDir, "sub");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "a.txt"), "aaa");
    fs.writeFileSync(path.join(subDir, "b.txt"), "bbb");

    copyFiles([{ src: subDir, dest: "sub" }], destDir);

    expect(fs.readFileSync(path.join(destDir, "sub", "a.txt"), "utf-8")).toBe("aaa");
    expect(fs.readFileSync(path.join(destDir, "sub", "b.txt"), "utf-8")).toBe("bbb");
  });

  it("should skip non-existent sources", () => {
    copyFiles([{ src: "/nonexistent/path", dest: "out" }], destDir);
    expect(fs.readdirSync(destDir)).toEqual([]);
  });

  it("should create parent directories for file targets", () => {
    const srcFile = path.join(srcDir, "file.txt");
    fs.writeFileSync(srcFile, "data");

    copyFiles([{ src: srcFile, dest: "deep/nested/file.txt" }], destDir);

    expect(
      fs.readFileSync(path.join(destDir, "deep", "nested", "file.txt"), "utf-8"),
    ).toBe("data");
  });
});

describe("getPackageName", () => {
  it("should return the package name from package.json", () => {
    // Running from repo root, so package.json exists
    const name = getPackageName();
    expect(name).toBe("@bonsae/nrg");
  });

  it("should return default when package.json does not exist", () => {
    const originalCwd = process.cwd();
    process.chdir(os.tmpdir());
    try {
      const name = getPackageName();
      expect(name).toBe("node-red-nodes");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
