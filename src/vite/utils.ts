import fs from "fs";
import path from "path";
import type { CopyTarget, PackageJson } from "./types";

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

/**
 * Auto-discover copy targets under the resources convention dir. `icons/` and
 * `locales/` have their own build pipelines (icon inlining, help/i18n
 * generation), so they're skipped here; every other folder (e.g. `examples/`)
 * is copied verbatim to `dist/<name>`. Returns [] when the dir is absent.
 */
const RESOURCE_PIPELINE_FOLDERS = new Set(["icons", "locales"]);

function discoverResourceCopyTargets(resourcesDir: string): CopyTarget[] {
  if (!fs.existsSync(resourcesDir)) return [];
  return fs
    .readdirSync(resourcesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !RESOURCE_PIPELINE_FOLDERS.has(entry.name),
    )
    .map((entry) => ({
      src: path.join(resourcesDir, entry.name),
      dest: entry.name,
    }));
}

function getPackageName(): string {
  const pkgPath = path.resolve("./package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PackageJson;
      return pkg.name;
    } catch {
      return "node-red-nodes";
    }
  }

  return "node-red-nodes";
}

function mergeOptions<T extends Record<string, any>>(
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
      Array.isArray(overrideVal) &&
      Array.isArray(defaultVal)
    ) {
      result[key] = [...new Set([...defaultVal, ...overrideVal])] as T[keyof T];
    } else if (
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

export {
  cleanDir,
  copyFiles,
  discoverResourceCopyTargets,
  getPackageName,
  mergeOptions,
};
