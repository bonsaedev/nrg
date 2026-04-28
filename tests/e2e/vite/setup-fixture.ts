import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * Sets up the fixture's node_modules so @bonsae/nrg resolves correctly.
 * Must be called before running builds that import from @bonsae/nrg.
 */
export function setupFixtureNodeModules(fixtureDir: string): void {
  const nrgDir = path.join(fixtureDir, "node_modules", "@bonsae", "nrg");
  if (fs.existsSync(nrgDir)) return;

  fs.mkdirSync(path.dirname(nrgDir), { recursive: true });

  // Copy package.json and build/ so Node can resolve @bonsae/nrg exports
  fs.cpSync(
    path.join(REPO_ROOT, "package.json"),
    path.join(nrgDir, "package.json"),
  );
  fs.cpSync(
    path.join(REPO_ROOT, "build"),
    path.join(nrgDir, "build"),
    { recursive: true },
  );
  // Copy src/ for TypeScript source exports (types)
  fs.cpSync(
    path.join(REPO_ROOT, "src"),
    path.join(nrgDir, "src"),
    { recursive: true },
  );
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
