import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
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
 * Write a publish-ready package.json into `distDir`. Combined with
 * `publishConfig.directory: "dist"`, this publishes the package's `dist/`
 * contents at the package root — so installed paths have no `dist/` segment
 * (e.g. `@bonsae/nrg/schemas/labels.schema.json`, not `.../dist/schemas/...`).
 *
 * Strips the `./dist/` prefix from every exports/main/module/types/bin path,
 * drops dev-only fields, resolves `workspace:*` deps to the package's own
 * (lockstep) version, and removes `publishConfig.directory` (the manifest
 * already sits at the publish root).
 */
export function writePublishManifest(
  packageRoot: string,
  distDir: string,
): void {
  const pkg = JSON.parse(
    readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
  );

  const stripDist = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(/^\.\/dist\//, "./");
    if (Array.isArray(value)) return value.map(stripDist);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, stripDist(v)]),
      );
    }
    return value;
  };

  const manifest: Record<string, any> = { ...pkg };
  delete manifest.files;
  delete manifest.scripts;
  delete manifest.devDependencies;
  manifest.publishConfig = { access: "public" };

  for (const field of ["exports", "main", "module", "types", "bin"]) {
    if (manifest[field]) manifest[field] = stripDist(manifest[field]);
  }

  if (manifest.dependencies) {
    manifest.dependencies = Object.fromEntries(
      Object.entries(manifest.dependencies).map(([name, range]) => [
        name,
        typeof range === "string" && range.startsWith("workspace:")
          ? pkg.version
          : range,
      ]),
    );
  }

  writeFileSync(
    path.join(distDir, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  // The package publishes dist/ as the root; never ship a stray tarball if one
  // gets packed into dist/ (e.g. a `pnpm pack` left over from a test run).
  writeFileSync(path.join(distDir, ".npmignore"), "*.tgz\n");
  console.log("✓ Wrote publish manifest → dist/package.json");
}
