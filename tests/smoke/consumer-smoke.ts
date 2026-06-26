// Consumer smoke test.
//
// Proves the *publishable* artifacts work for a downstream nrg project. It
// builds and packs the toolkit + runtime tarballs (honoring
// publishConfig.directory="dist"), installs them into a copy of the
// tests/fixtures/smoke-consumer folder OUTSIDE the workspace, and then runs the
// three things a consumer actually does:
//
//   1. tsc   — server + client typecheck against the shipped core tsconfigs
//   2. build — `vite build` produces a publishable Node-RED package
//   3. dev   — `vite --mode development` boots Node-RED
//
// In-repo tests run against source, where the client type shims resolve within
// the monorepo. This is the only test that exercises the *published* package
// from a consumer's point of view — the gap that let 0.22.0 ship a
// tsconfig/core/client.json whose `files` referenced shims missing from the
// toolkit (TS6053 for every consumer).

import type { ChildProcess } from "child_process";
import { spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
// @bonsae/nrg packs from the repo root (publishConfig.directory="dist/toolkit"
// is honored by pnpm pack). @bonsae/nrg-runtime is the build-emitted artifact
// at dist/runtime (its own generated package.json, packed directly).
const TOOLKIT_DIR = REPO_ROOT;
const RUNTIME_DIR = path.join(REPO_ROOT, "dist", "runtime");
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "smoke-consumer");
const IS_WINDOWS = process.platform === "win32";

const timeoutArg = process.argv.find((a) => a.startsWith("--timeout="));
const DEV_TIMEOUT = timeoutArg
  ? parseInt(timeoutArg.split("=")[1], 10)
  : 300_000;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function depVersion(pkgJsonPath: string, dep: string): string {
  const p = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  const v = p.dependencies?.[dep] ?? p.devDependencies?.[dep];
  if (!v) throw new Error(`${dep} not found in ${pkgJsonPath}`);
  return v;
}

// pnpm pack (not npm pack) so publishConfig.directory is honored (the tarball
// contains the published layout). The printed tarball path is absolute when
// publishConfig.directory is set (the toolkit) but relative to the pack cwd
// otherwise (the runtime), so resolve it against pkgDir to get an absolute path
// either way.
function pack(pkgDir: string): string {
  const out = execSync("pnpm pack --pack-destination .", {
    cwd: pkgDir,
    encoding: "utf-8",
  }).trim();
  return path.resolve(pkgDir, out.split("\n").pop()!.trim());
}

function killProcess(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  try {
    if (IS_WINDOWS) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already exited */
    }
  }
}

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.on("exit", () => resolve());
    setTimeout(() => resolve(), 5000);
  });
}

// --- Test: tsc ------------------------------------------------------------

function tscOk(
  consumerDir: string,
  project: string,
): { ok: boolean; out: string } {
  // Invoke tsc via node + its bin script (not node_modules/.bin/tsc) so it
  // resolves identically on Windows, macOS, and Linux.
  const tscBin = path.join(
    consumerDir,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  try {
    execSync(`"${process.execPath}" "${tscBin}" -p ${project} --noEmit`, {
      cwd: consumerDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return { ok: true, out: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

function testTypecheck(consumerDir: string): void {
  log("--- Test: tsc (server + client) ---");
  for (const project of [
    "src/server/tsconfig.json",
    "src/client/tsconfig.json",
  ]) {
    const { ok, out } = tscOk(consumerDir, project);
    if (!ok) {
      console.log(out);
      throw new Error(`tsc failed for ${project}`);
    }
  }
  log("PASS: server and client typecheck against the published package.");
}

// --- Test: vite build -----------------------------------------------------

function testBuild(consumerDir: string, viteEntry: string): void {
  log("--- Test: vite build ---");
  const buildOutDir = path.join(consumerDir, "dist");
  if (fs.existsSync(buildOutDir)) fs.rmSync(buildOutDir, { recursive: true });

  try {
    execSync(`"${process.execPath}" "${viteEntry}" build`, {
      cwd: consumerDir,
      stdio: "inherit",
      timeout: 300_000,
      env: { ...process.env, CI: "true", NO_COLOR: "1" },
    });
  } catch (error) {
    throw new Error(
      `vite build exited non-zero: ${(error as { status?: number }).status}`,
    );
  }

  assert(fs.existsSync(buildOutDir), "dist/ was not created");
  assert(
    fs.existsSync(path.join(buildOutDir, "index.js")),
    "dist/index.js (server bundle) not found",
  );
  assert(
    fs.existsSync(path.join(buildOutDir, "index.html")),
    "dist/index.html (client entry) not found",
  );

  const pkg = JSON.parse(
    fs.readFileSync(path.join(buildOutDir, "package.json"), "utf-8"),
  );
  assert(
    pkg["node-red"]?.nodes !== undefined,
    "dist/package.json missing node-red.nodes manifest",
  );
  // The split: a built node depends on the runtime, never the toolkit.
  assert(
    pkg.dependencies?.["@bonsae/nrg-runtime"] !== undefined,
    "dist/package.json must declare @bonsae/nrg-runtime",
  );
  assert(
    pkg.dependencies?.["@bonsae/nrg"] === undefined,
    "dist/package.json must not declare the @bonsae/nrg toolkit",
  );
  log("PASS: vite build produced a publishable Node-RED package.");
}

// --- Test: vite dev (Node-RED boots) --------------------------------------

async function testDevServer(
  consumerDir: string,
  viteEntry: string,
): Promise<void> {
  log("--- Test: vite dev (Node-RED boots) ---");
  const child = spawn(process.execPath, [viteEntry, "--mode", "development"], {
    cwd: consumerDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
  });

  let output = "";
  let settled = false;
  const SUCCESS_MARKERS = [
    "Started flows",
    "Server now running",
    "Node-RED started",
  ];

  const result = await Promise.race([
    new Promise<string>((resolve) => {
      const onLine = (line: string): void => {
        output += line + "\n";
        console.log(`  [vite] ${line}`);
        if (!settled && SUCCESS_MARKERS.some((m) => line.includes(m))) {
          settled = true;
          resolve("success");
        }
      };
      const onData = (data: Buffer): void => {
        for (const line of data.toString().split("\n").filter(Boolean))
          onLine(line);
      };
      child.stdout!.on("data", onData);
      child.stderr!.on("data", onData);
      child.on("exit", (code) => {
        if (!settled) {
          settled = true;
          resolve(code === 0 ? "exited-clean" : `exited-${code}`);
        }
      });
    }),
    new Promise<string>((resolve) =>
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve("timeout");
        }
      }, DEV_TIMEOUT),
    ),
  ]);

  killProcess(child);
  await waitForExit(child);

  if (result === "success") {
    log("PASS: Node-RED started under the dev server.");
    return;
  }
  log("--- Captured dev output ---");
  console.log(output);
  if (result === "timeout") {
    throw new Error(`Timed out after ${DEV_TIMEOUT}ms waiting for Node-RED`);
  }
  throw new Error(`Dev server exited unexpectedly: ${result}`);
}

async function main(): Promise<void> {
  log("=== NRG Consumer Smoke Test ===");
  log(`Platform: ${process.platform}`);

  // Validate the built artifact; build it if absent so the test runs
  // standalone. CI builds first, so this is a no-op there.
  if (
    !fs.existsSync(path.join(REPO_ROOT, "dist", "toolkit")) ||
    !fs.existsSync(RUNTIME_DIR)
  ) {
    log("dist not found — running pnpm build first...");
    execSync("pnpm build", { cwd: REPO_ROOT, stdio: "inherit" });
  }

  log("Packing @bonsae/nrg-runtime and @bonsae/nrg...");
  const runtimeTgz = pack(RUNTIME_DIR);
  const toolkitTgz = pack(TOOLKIT_DIR);
  log(`  ${path.basename(runtimeTgz)}`);
  log(`  ${path.basename(toolkitTgz)}`);

  const tsRange = depVersion(
    path.join(TOOLKIT_DIR, "package.json"),
    "typescript",
  );
  const vueRange = depVersion(path.join(TOOLKIT_DIR, "package.json"), "vue");
  const nodeTypes = depVersion(
    path.join(REPO_ROOT, "package.json"),
    "@types/node",
  );

  // Isolated consumer OUTSIDE the workspace (pnpm-workspace.yaml covers
  // packages/*, but tooling walks up to the repo root — so build in os.tmpdir()).
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-consumer-"));
  log(`Consumer project: ${consumerDir}`);

  try {
    // Copy the committed fixture folder (source of truth) into the temp project.
    fs.cpSync(FIXTURE, consumerDir, { recursive: true });

    // npm (not pnpm) keeps the consumer isolated from the workspace. Both
    // tarballs are installed explicitly so the toolkit's runtime dependency
    // resolves from the local tarball, never the registry.
    const toolkitForInstall = toolkitTgz.split(path.sep).join("/");
    const runtimeForInstall = runtimeTgz.split(path.sep).join("/");
    log("Installing packed packages + toolchain into the consumer...");
    execSync(
      `npm install --no-audit --no-fund "${toolkitForInstall}" "${runtimeForInstall}" ` +
        `"typescript@${tsRange}" "vue@${vueRange}" "@types/node@${nodeTypes}" ` +
        `vite@^6.0.0 node-red@latest`,
      // node-red@latest is a large tree; Windows runners (slow I/O + Defender)
      // routinely need >6min for a cold install, so allow generous headroom.
      { cwd: consumerDir, stdio: "inherit", timeout: 900_000 },
    );

    const viteEntry = path.join(
      consumerDir,
      "node_modules",
      "vite",
      "bin",
      "vite.js",
    );

    const failures: string[] = [];
    const checks: Array<[string, () => void | Promise<void>]> = [
      ["tsc", () => testTypecheck(consumerDir)],
      ["build", () => testBuild(consumerDir, viteEntry)],
      ["dev", () => testDevServer(consumerDir, viteEntry)],
    ];
    for (const [name, run] of checks) {
      try {
        await run();
      } catch (error) {
        log(`FAIL: ${name} — ${(error as Error).message}`);
        failures.push(name);
      }
    }

    if (failures.length > 0) {
      log(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
      process.exit(1);
    }
    log("\nAll consumer smoke checks passed (tsc + build + dev).");
    process.exit(0);
  } finally {
    for (const p of [consumerDir, runtimeTgz, toolkitTgz]) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
