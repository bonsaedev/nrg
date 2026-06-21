import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const TOOLKIT_PKG = path.join(REPO_ROOT, "packages", "toolkit");
const RUNTIME_PKG = path.join(REPO_ROOT, "packages", "runtime");

/** Copy a built workspace package (package.json + dist) into node_modules. */
function copyPackage(pkgDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(path.join(pkgDir, "package.json"), path.join(destDir, "package.json"));
  fs.cpSync(path.join(pkgDir, "dist"), path.join(destDir, "dist"), {
    recursive: true,
  });
}

/**
 * Sets up the fixture's node_modules so @bonsae/nrg and @bonsae/nrg-runtime
 * resolve correctly. Must be called before running builds that import from
 * @bonsae/nrg.
 *
 * Both packages are copied because a real install pulls in @bonsae/nrg-runtime
 * transitively (the toolkit depends on it), and the built server bundle imports
 * `@bonsae/nrg-runtime/server` — which the client build loads at build time.
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
