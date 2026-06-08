import type { ChildProcess } from "child_process";
import { spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const IS_WINDOWS = process.platform === "win32";

const timeoutArg = process.argv.find((a) => a.startsWith("--timeout="));
const TIMEOUT = timeoutArg ? parseInt(timeoutArg.split("=")[1], 10) : 300_000;

const PACKAGE_JSON = {
  name: "nrg-vite-integration-test",
  version: "0.0.0",
  private: true,
  type: "module",
};

const VITE_CONFIG = `\
import { defineConfig } from "vite";
import { nodeRed } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [
    nodeRed({
      extraFilesCopyTargets: [],
    }),
  ],
});
`;

const SERVER_INDEX = `\
import TestNode from "./nodes/test-node";

export default {
  nodes: [TestNode],
};
`;

const TEST_NODE = `\
import { IONode, SchemaType } from "@bonsae/nrg/server";

const ConfigsSchema = SchemaType.Object({
  name: SchemaType.String({ default: "smoke-test" }),
});

export default class TestNode extends IONode {
  static override readonly type = "smoke-test-node";
  static override readonly category = "function";
  static override readonly color = "#a6bbcf";
  static override readonly configSchema = ConfigsSchema;
}
`;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function writeProjectFile(
  base: string,
  rel: string,
  content: string | object,
): void {
  const filepath = path.join(base, rel);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(
    filepath,
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );
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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function testBuild(tmpDir: string, viteEntry: string): Promise<void> {
  log("--- Test: vite build ---");

  const buildOutDir = path.join(tmpDir, "dist");
  if (fs.existsSync(buildOutDir)) {
    fs.rmSync(buildOutDir, { recursive: true });
  }

  log("Running vite build...");
  try {
    execSync(`"${process.execPath}" "${viteEntry}" build`, {
      cwd: tmpDir,
      stdio: "inherit",
      timeout: 120_000,
      env: { ...process.env, CI: "true", NO_COLOR: "1" },
    });
  } catch (error) {
    throw new Error(
      `vite build exited with non-zero code: ${(error as { status?: number }).status}`,
    );
  }

  log("Verifying build output...");
  assert(fs.existsSync(buildOutDir), "dist/ directory was not created");

  const serverBundle = path.join(buildOutDir, "index.js");
  assert(
    fs.existsSync(serverBundle),
    "dist/index.js (server bundle) not found",
  );

  const packageJson = path.join(buildOutDir, "package.json");
  assert(fs.existsSync(packageJson), "dist/package.json not found");

  const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
  assert(
    pkg["node-red"]?.nodes !== undefined,
    "dist/package.json missing node-red.nodes manifest",
  );

  const indexHtml = path.join(buildOutDir, "index.html");
  assert(fs.existsSync(indexHtml), "dist/index.html (client entry) not found");

  log("PASS: vite build completed successfully.");
}

async function testDevServer(tmpDir: string, viteEntry: string): Promise<void> {
  log("--- Test: vite dev ---");

  log("Starting vite dev server...");
  const child = spawn(process.execPath, [viteEntry, "--mode", "development"], {
    cwd: tmpDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
  });

  log(`Spawned vite (pid ${child.pid})`);

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

      child.stdout!.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean))
          onLine(line);
      });
      child.stderr!.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean))
          onLine(line);
      });
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
      }, TIMEOUT),
    ),
  ]);

  log(`Result: ${result}`);
  killProcess(child);
  await waitForExit(child);

  if (result === "success") {
    log("PASS: vite dev server started successfully.");
    return;
  }

  log("--- Captured output ---");
  console.log(output);

  if (result === "timeout") {
    throw new Error(
      `Timed out after ${TIMEOUT}ms waiting for Node-RED to start`,
    );
  }
  throw new Error(`Process exited unexpectedly: ${result}`);
}

async function main(): Promise<void> {
  log("=== NRG Vite Integration Tests ===");
  log(`Platform: ${process.platform}, Timeout: ${TIMEOUT}ms`);

  if (!fs.existsSync(path.join(DIST_DIR, "package.json"))) {
    console.error("ERROR: dist/package.json not found. Run the build first.");
    process.exit(1);
  }

  log("Packing dist/ into tarball...");
  const packOutput = execSync("npm pack --pack-destination .", {
    cwd: DIST_DIR,
    encoding: "utf-8",
  }).trim();
  const tarballName = packOutput.split("\n").pop()!.trim();
  const tarballPath = path.join(DIST_DIR, tarballName);
  log(`Packed: ${tarballName}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-integration-"));
  log(`Project dir: ${tmpDir}`);

  try {
    writeProjectFile(tmpDir, "package.json", PACKAGE_JSON);
    writeProjectFile(tmpDir, "vite.config.ts", VITE_CONFIG);
    writeProjectFile(tmpDir, "src/server/index.ts", SERVER_INDEX);
    writeProjectFile(tmpDir, "src/server/nodes/test-node.ts", TEST_NODE);

    log("Installing dependencies...");
    const tarballForInstall = tarballPath.split(path.sep).join("/");
    execSync(
      `npm install --no-audit --no-fund "${tarballForInstall}" vite@^6.0.0 node-red@latest`,
      { cwd: tmpDir, stdio: "inherit", timeout: 360_000 },
    );
    log("Dependencies installed.");

    const viteEntry = path.join(
      tmpDir,
      "node_modules",
      "vite",
      "bin",
      "vite.js",
    );

    const failures: string[] = [];

    try {
      await testBuild(tmpDir, viteEntry);
    } catch (error) {
      log(`FAIL: vite build — ${(error as Error).message}`);
      failures.push("vite build");
    }

    try {
      await testDevServer(tmpDir, viteEntry);
    } catch (error) {
      log(`FAIL: vite dev — ${(error as Error).message}`);
      failures.push("vite dev");
    }

    if (failures.length > 0) {
      log(`\n${failures.length} test(s) failed: ${failures.join(", ")}`);
      process.exit(1);
    }

    log("\nAll tests passed.");
    process.exit(0);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      log("Warning: Could not clean up temp dir");
    }
    try {
      fs.unlinkSync(tarballPath);
    } catch {
      /* tarball may already be cleaned */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
