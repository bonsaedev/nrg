import fs from "fs";
import path from "path";
import type { NodeRedRuntimeSettings, PackageJson } from "./types";

function cleanDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyFiles(targets: CopyTarget[], outDir: string): void {
  for (const { src, dest } of targets) {
    const srcPath = path.resolve(src);
    const destPath = path.join(outDir, dest);

    if (!fs.existsSync(srcPath)) {
      continue;
    }

    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getPackageName(): string {
  const pkgPath = path.resolve("./package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PackageJson;
    return pkg.name;
  }

  return "node-red-nodes";
}

function mergeOptions<T extends Record<string, unknown>>(
  defaults: T,
  overrides?: Partial<T>,
): T {
  if (!overrides) return { ...defaults };

  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const overrideVal = overrides[key];
    const defaultVal = defaults[key];
    if (
      overrideVal !== undefined &&
      !Array.isArray(overrideVal) &&
      !Array.isArray(defaultVal) &&
      typeof overrideVal === "object" &&
      typeof defaultVal === "object" &&
      overrideVal !== null &&
      defaultVal !== null
    ) {
      result[key] = mergeOptions(
        defaultVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Define Node-RED runtime settings with full type support.
 *
 * Note: All paths should be absolute. Use `import.meta.dirname` or `__dirname` to resolve relative paths.
 *
 * @example
 * ```typescript
 * import { defineRuntimeSettings } from "./vite/utils";
 * import path from "path";
 *
 * const __dirname = import.meta.dirname;
 *
 * export default defineRuntimeSettings({
 *   userDir: path.resolve(__dirname, ".node-red"),
 *   flowFile: "flows.json",
 *   httpStatic: path.resolve(__dirname, "public"),
 * });
 * ```
 */
function defineRuntimeSettings(
  settings: NodeRedRuntimeSettings,
): NodeRedRuntimeSettings {
  return settings;
}

export {
  cleanDir,
  copyFiles,
  defineRuntimeSettings,
  getPackageName,
  mergeOptions,
};
