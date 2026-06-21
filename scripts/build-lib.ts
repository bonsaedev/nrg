import { execSync } from "child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";

/**
 * Shared helpers for the per-package build scripts, run with `tsx build.ts`
 * (cwd = the package). Kept identical across packages so the esbuild
 * invocation and dts flags can't drift.
 */

/**
 * dts-bundle-generator flags. Each package supplies its own `tsconfig.dts.json`
 * next to its build.ts (resolved relative to the build cwd).
 */
export const DTS_FLAGS =
  "--no-check --project tsconfig.dts.json --export-referenced-types=false";

/** Bundle one entry with esbuild (bundled, deps external, node platform). */
export function esbuildBundle(
  entry: string,
  {
    format = "esm",
    outfile,
    outdir,
  }: { format?: string; outfile?: string; outdir?: string },
): void {
  const out = outfile ? `--outfile=${outfile}` : `--outdir=${outdir}`;
  execSync(
    `esbuild ${entry} --bundle --packages=external --format=${format} --platform=node ${out}`,
    { stdio: "inherit" },
  );
}

/** Remove a dist directory if present. */
export function clean(dist: string): void {
  if (existsSync(dist)) rmSync(dist, { recursive: true });
  console.log("✓ Cleaned dist/");
}

/**
 * Inline the single extracted `.css` in `dir` into `jsFile` so styles load with
 * the script, then delete the stray `.css`. `guard` wraps the injection in a
 * `typeof document !== "undefined"` check for bundles that may load outside a
 * DOM (e.g. the component test entry under Node).
 */
export function inlineCss(
  dir: string,
  jsFile: string,
  { guard = false }: { guard?: boolean } = {},
): void {
  const cssFile = readdirSync(dir).find((f) => f.endsWith(".css"));
  if (!cssFile) return;
  const css = readFileSync(path.join(dir, cssFile), "utf-8");
  const jsPath = path.join(dir, jsFile);
  const js = readFileSync(jsPath, "utf-8");
  const make = `var s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s);`;
  const inject = guard
    ? `(function(){if(typeof document!=="undefined"){${make}}})();\n`
    : `(function(){${make}})();\n`;
  writeFileSync(jsPath, inject + js);
  unlinkSync(path.join(dir, cssFile));
}
