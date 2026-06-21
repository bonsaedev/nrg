import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");

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

  // Copy dist/ contents as the package root — mirrors what npm publishes
  if (!fs.existsSync(nrgDir)) {
    fs.mkdirSync(path.dirname(nrgDir), { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, "dist"), nrgDir, { recursive: true });
  }

  // Copy dist-runtime/ as @bonsae/nrg-runtime — the runtime the built bundle
  // depends on, present at the top level as npm would hoist it.
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(path.dirname(runtimeDir), { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, "dist-runtime"), runtimeDir, {
      recursive: true,
    });
  }
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
