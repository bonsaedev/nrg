// Consumer smoke test.
//
// Proves the *publishable* artifacts work for a downstream nrg project. It
// builds and packs the toolkit + runtime tarballs (honoring
// publishConfig.directory="dist/toolkit"), installs them into a copy of the
// tests/fixtures/smoke-consumer folder OUTSIDE the workspace, and then runs the
// three things a consumer actually does:
//
//   1. tsc   — server + client typecheck against the shipped lib tsconfigs
//   2. build — `vite build` produces a publishable Node-RED package
//   3. dev   — `vite --mode development` boots Node-RED
//
// In-repo tests run against source, where the client type shims resolve within
// the monorepo. This is the only test that exercises the *published* package
// from a consumer's point of view — the gap that let 0.22.0 ship a
// tsconfig/lib/client.json whose `files` referenced shims missing from the
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

// The EXACT version this repo is validated against, read from its installed
// node_modules. The consumer must install the SAME vite/vitest pair — a floating
// `vite@^6.0.0 vitest@^4.0.0` can resolve an incompatible combo (e.g. vite 6.0.0
// + vitest 4.1.9, whose ModuleRunner APIs mismatch and crash vitest at startup),
// which fails the smoke on a version drift the toolkit never actually ships with.
function repoResolvedVersion(dep: string): string {
  const pkg = path.join(REPO_ROOT, "node_modules", dep, "package.json");
  return JSON.parse(fs.readFileSync(pkg, "utf-8")).version;
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

// Import, boot, AND register a real node through the published
// `@bonsae/nrg/test/server/integration` entry the way a consumer's test runner
// does: Node's *native* ESM resolver (node_modules externalized), not
// vitest-on-source or CJS require(). Three published-only failure modes this
// catches, all masked in-repo (source = single identity) and under CJS
// require(): (a) extensionless deep import `ajv/dist/compile/rules` — import
// fails [0.26.0]; (b) bundled core-server `__dirname` undefined in ESM — boot
// fails [0.26.1]; (c) the bundle inlining its own `@bonsae/nrg/server` copy, so
// a consumer node fails `instanceof Node` at registration [0.26.2]. (a) needs
// only an import, (b) a boot with nodes:[], (c) a boot that actually REGISTERS a
// node extending the host's `@bonsae/nrg/server` — so register one here.
function testEsmBoot(consumerDir: string): void {
  log("--- Test: ESM import + boot + register of the integration runtime ---");
  const probe = path.join(consumerDir, "__nrg_esm_smoke.mjs");
  fs.writeFileSync(
    probe,
    `import { defineIONode } from "@bonsae/nrg/server";\n` +
      `import { startRuntime } from "@bonsae/nrg/test/server/integration";\n` +
      `const Probe = defineIONode({ type: "nrg-smoke-probe", input(msg) { this.send?.(msg); } });\n` +
      `const rt = await startRuntime({ nodes: [Probe] });\n` +
      `await rt.stop();\n` +
      `console.log("ESM_BOOT_OK");\n`,
  );
  try {
    const out = execSync(`"${process.execPath}" "${probe}"`, {
      cwd: consumerDir,
      encoding: "utf-8",
      // Fail fast if a boot hangs instead of blocking until the CI job timeout.
      timeout: 60_000,
    });
    assert(
      out.includes("ESM_BOOT_OK"),
      "integration runtime did not boot/register a node",
    );
  } finally {
    try {
      fs.rmSync(probe, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
  log(
    "PASS: the published integration entry imports, boots, and registers a node under Node ESM.",
  );
}

// --- Test: server-unit vitest tier (runs the published toolkit) -----------

// The other checks cover tsc/build/dev + the integration ESM boot. This runs an
// actual `createNode` unit test through the packed toolkit's vitest defaultConfig
// — exercising the shipped `@bonsae/nrg/test/server/unit` bytes, the config
// subpath, and the include glob, in a plain Node env (no browser, no flake).
function testServerUnitTier(consumerDir: string): void {
  log("--- Test: server-unit vitest tier (packed toolkit) ---");
  const vitestBin = path.join(
    consumerDir,
    "node_modules",
    "vitest",
    "vitest.mjs",
  );
  try {
    const out = execSync(
      `"${process.execPath}" "${vitestBin}" run --config vitest.server.unit.config.ts`,
      {
        cwd: consumerDir,
        encoding: "utf-8",
        timeout: 120_000,
        env: { ...process.env, CI: "true", NO_COLOR: "1" },
      },
    );
    assert(/\b1 passed\b/.test(out), "server-unit smoke test did not pass");
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    console.log((err.stdout ?? "") + (err.stderr ?? ""));
    throw new Error("server-unit vitest tier failed");
  }
  log(
    "PASS: a real createNode test ran through the packed server-unit toolkit.",
  );
}

// --- Test: every published subpath resolves (no browser) ------------------

// `import.meta.resolve` validates the package `exports` map WITHOUT executing
// the target — so we can confirm the client + test subpaths ship (the ones we
// can't import in Node because they pull in Vue / a browser provider) without a
// browser at all. Covers the "shipped exports map is complete" class.
function testSubpathsResolvable(consumerDir: string): void {
  log("--- Test: published subpaths resolve under Node ESM ---");
  // NOTE: `@bonsae/nrg/client` is deliberately TYPES-ONLY in exports (the client
  // runtime is browser-served, and consumers only `import type` from it). So it's
  // covered by the tsc check, not this runtime-resolution probe.
  const subpaths = [
    "@bonsae/nrg/server",
    "@bonsae/nrg/schema",
    "@bonsae/nrg/vite",
    "@bonsae/nrg/eslint",
    "@bonsae/nrg/test/server/unit",
    "@bonsae/nrg/test/server/unit/config",
    "@bonsae/nrg/test/server/integration",
    "@bonsae/nrg/test/client/unit/config",
    "@bonsae/nrg/test/client/component/config",
  ];
  const probe = path.join(consumerDir, "__nrg_subpath_probe.mjs");
  fs.writeFileSync(
    probe,
    `const subpaths = ${JSON.stringify(subpaths)};\n` +
      `for (const s of subpaths) {\n` +
      `  try { import.meta.resolve(s); }\n` +
      `  catch (e) { throw new Error("subpath did not resolve: " + s + " — " + e.message); }\n` +
      `}\n` +
      `console.log("SUBPATHS_OK");\n`,
  );
  try {
    const out = execSync(`"${process.execPath}" "${probe}"`, {
      cwd: consumerDir,
      encoding: "utf-8",
      timeout: 60_000,
    });
    assert(out.includes("SUBPATHS_OK"), "a published subpath did not resolve");
  } finally {
    try {
      fs.rmSync(probe, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
  log("PASS: all published subpaths resolve via the exports map.");
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
        `"vite@${repoResolvedVersion("vite")}" "vitest@${repoResolvedVersion("vitest")}" node-red@latest`,
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
      ["subpaths", () => testSubpathsResolvable(consumerDir)],
      ["server-unit", () => testServerUnitTier(consumerDir)],
      ["esm-boot", () => testEsmBoot(consumerDir)],
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
    log(
      "\nAll consumer smoke checks passed (tsc + subpaths + server-unit + esm-boot + build + dev).",
    );
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
