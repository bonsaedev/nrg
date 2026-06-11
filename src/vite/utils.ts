import fs from "fs";
import path from "path";
import { ConfigError } from "./errors";
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

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalize an arbitrary string into a URL-safe slug: lowercase ASCII
 * letters/digits separated by single hyphens. Accents are stripped, runs of
 * other characters collapse to one hyphen, and leading/trailing hyphens are
 * removed. Returns "" when nothing slug-worthy remains.
 */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve the dev server slug. A user-provided slug must already be URL-safe —
 * it is validated, never silently rewritten — so a typo surfaces as an error
 * instead of a surprising URL. When omitted it defaults to the slugified
 * project folder name (falling back to "app" if that yields nothing).
 */
function resolveSlug(userSlug?: string): string {
  if (userSlug !== undefined) {
    const trimmed = userSlug.trim();
    if (!SLUG_PATTERN.test(trimmed)) {
      const suggestion = slugify(trimmed);
      throw new ConfigError(
        `Invalid dev server slug ${JSON.stringify(userSlug)}. A slug must be ` +
          `URL-safe: lowercase letters, digits and single hyphens ` +
          `(matching ${String(SLUG_PATTERN)}).` +
          (suggestion ? ` Did you mean ${JSON.stringify(suggestion)}?` : ""),
      );
    }
    return trimmed;
  }
  return slugify(path.basename(process.cwd())) || "app";
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
  getPackageName,
  mergeOptions,
  resolveSlug,
  slugify,
  SLUG_PATTERN,
};
