import fs from "fs";
import path from "path";

// Built nodes import nrg's entries from the dev package (@bonsae/nrg) at author
// time, but the shipped node must depend on the standalone runtime package —
// @bonsae/nrg carries build tooling that must never reach the Node-RED
// container. The server build emits the bundle with the TOOLKIT specifiers (so
// the node-definitions extractor can load it), then renames them to the runtime
// as the final step via rewriteEmittedRuntimeImports.
const RUNTIME_REWRITES: Record<string, string> = {
  // Both authoring specifiers collapse to the single runtime bundle. At server
  // runtime the schema kit and the server are all server-side, so
  // @bonsae/nrg-runtime ships them in one artifact (its sole `.` export) — the
  // toolkit keeps @bonsae/nrg/server and @bonsae/nrg/schema separate for authoring.
  "@bonsae/nrg/server": "@bonsae/nrg-runtime",
  "@bonsae/nrg/schema": "@bonsae/nrg-runtime",
};

/**
 * Rename the toolkit import specifiers (`@bonsae/nrg/{server,schema}`) in the
 * emitted server bundles to the runtime package. Runs as the FINAL server-build
 * step — after the node-definitions extractor has loaded the bundle (which needs
 * the toolkit specifiers to resolve at build time). The server bundle keeps
 * toolkit imports through the whole build; this single pass produces the shipped
 * runtime-facing artifact, so nothing has to "undo" a rewrite and the server is
 * never bundled twice.
 *
 * Production only: dev bundles keep the toolkit import (Node-RED loads them from
 * the output dir with no install step). Scans only the output-dir root (server
 * entries live there; the client build writes under resources/), and only
 * rewrites quoted specifiers, so third-party imports and `@bonsae/nrg/client`
 * are untouched.
 */
function rewriteEmittedRuntimeImports(outDir: string): void {
  const entries = Object.entries(RUNTIME_REWRITES);
  for (const file of fs.readdirSync(outDir)) {
    if (!/\.(mjs|cjs|js)$/.test(file)) continue;
    const filePath = path.join(outDir, file);
    if (!fs.statSync(filePath).isFile()) continue;
    let code = fs.readFileSync(filePath, "utf-8");
    let changed = false;
    for (const [toolkit, runtime] of entries) {
      const escaped = toolkit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(['"])${escaped}\\1`, "g");
      if (re.test(code)) {
        code = code.replace(re, `$1${runtime}$1`);
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(filePath, code);
  }
}

export { RUNTIME_REWRITES, rewriteEmittedRuntimeImports };
