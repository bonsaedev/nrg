import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
// The published packages ARE the build output dirs (publishable layout, with a
// stripped package.json at their root) — dist/toolkit for @bonsae/nrg and
// dist/runtime for @bonsae/nrg-runtime. Copy them verbatim into node_modules.
const TOOLKIT_PKG = path.join(REPO_ROOT, "dist", "toolkit");
const RUNTIME_PKG = path.join(REPO_ROOT, "dist", "runtime");

/** Copy a built, publishable package directory into node_modules. */
function copyPackage(pkgDir: string, destDir: string): void {
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(pkgDir, destDir, { recursive: true });
}

/**
 * Sets up the fixture's node_modules so @bonsae/nrg and @bonsae/nrg-runtime
 * resolve correctly. Must be called before running builds that import from
 * @bonsae/nrg.
 *
 * Both are copied because a built node's server bundle imports
 * `@bonsae/nrg-runtime` (loaded at build time by the client build) while
 * the author-time surface resolves from @bonsae/nrg.
 */
export function setupFixtureNodeModules(fixtureDir: string): void {
  const nrgDir = path.join(fixtureDir, "node_modules", "@bonsae", "nrg");
  const runtimeDir = path.join(
    fixtureDir,
    "node_modules",
    "@bonsae",
    "nrg-runtime",
  );

  if (!fs.existsSync(nrgDir)) copyPackage(TOOLKIT_PKG, nrgDir);
  if (!fs.existsSync(runtimeDir)) copyPackage(RUNTIME_PKG, runtimeDir);
}

/**
 * Cleans up the fixture's node_modules.
 */
export function cleanFixtureNodeModules(fixtureDir: string): void {
  const nmDir = path.join(fixtureDir, "node_modules");
  if (fs.existsSync(nmDir)) {
    fs.rmSync(nmDir, { recursive: true });
  }
}
