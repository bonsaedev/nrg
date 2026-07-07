import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeRedStartError } from "../errors";
import type { ResolveNodeRedOptions } from "./types";

function getNodeRedCommand(version?: string): string {
  return version ? `node-red@${version}` : "node-red";
}

function resolveNodeRedFromLocalNodeModules(): string | null {
  try {
    const require_ = createRequire(path.join(process.cwd(), "package.json"));
    const pkgJsonPath = require_.resolve("node-red/package.json");
    const pkgDir = path.dirname(pkgJsonPath);
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["node-red"];
    if (!bin) return null;
    const entry = path.resolve(pkgDir, bin);
    return fs.existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

async function resolveNodeRed(options: ResolveNodeRedOptions): Promise<string> {
  const { version, npxTimeoutMs = 300_000, logger } = options;

  // the version is interpolated into a shell command — reject anything
  // outside npm version/range/tag syntax so typos fail fast and clearly
  if (version && !/^[\w.^~<>=*-]+$/.test(version)) {
    throw new NodeRedStartError(
      new Error(`Invalid node-red version "${version}"`),
    );
  }

  const nodeRedCommand = getNodeRedCommand(version);

  logger.info(`Resolving ${nodeRedCommand} entry point...`);

  const hasExplicitVersion = version !== undefined && version !== "latest";

  if (!hasExplicitVersion) {
    const localEntry = resolveNodeRedFromLocalNodeModules();
    if (localEntry) {
      logger.info(`Resolved from local node_modules: ${localEntry}`);
      return localEntry;
    }
  }

  logger.info(
    hasExplicitVersion
      ? `Using configured version (${version}), downloading via npx...`
      : `Not found locally, downloading via npx (this may take a while)...`,
  );

  // unique per call: two launchers in one process may resolve concurrently,
  // and one's cleanup must not unlink a script the other still needs
  const resolverScript = path.join(
    os.tmpdir(),
    `nrg-resolve-node-red-${process.pid}-${randomUUID()}.cjs`,
  );

  fs.writeFileSync(
    resolverScript,
    `const fs = require("fs");
const path = require("path");
const isWin = process.platform === "win32";
const binName = isWin ? "node-red.cmd" : "node-red";
const dirs = process.env.PATH.split(path.delimiter);
for (const d of dirs) {
  const f = path.join(d, binName);
  if (fs.existsSync(f)) {
    if (isWin) {
      const nodeRedDir = path.resolve(d, "..", "node-red");
      const pkg = JSON.parse(fs.readFileSync(path.join(nodeRedDir, "package.json"), "utf-8"));
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin["node-red"];
      process.stdout.write(path.resolve(nodeRedDir, bin));
    } else {
      process.stdout.write(fs.realpathSync(f));
    }
    break;
  }
}`,
  );

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      // positional command form (no -c) keeps quoting single-level, so the
      // script path survives spaces in tmpdir on every platform
      exec(
        `npx --yes -p ${nodeRedCommand} node "${resolverScript}"`,
        { timeout: npxTimeoutMs },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        },
      );
    });
    const entryPoint = stdout.trim();

    if (!entryPoint || !fs.existsSync(entryPoint)) {
      throw new NodeRedStartError(
        new Error(
          `Could not resolve node-red entry point: ${entryPoint || "(empty)"}`,
        ),
      );
    }

    logger.info(`Resolved via npx: ${entryPoint}`);
    return entryPoint;
  } finally {
    try {
      fs.unlinkSync(resolverScript);
    } catch {
      // ignore cleanup errors
    }
  }
}

export {
  getNodeRedCommand,
  resolveNodeRedFromLocalNodeModules,
  resolveNodeRed,
};
