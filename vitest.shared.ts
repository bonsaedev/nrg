import path from "path";

/**
 * Resolve aliases shared by every workspace-aware vitest config.
 *
 * `@/*` point at the package sources. The `@bonsae/nrg-runtime/server` and
 * `@bonsae/nrg/server` subpaths map to the runtime SOURCE (now under the
 * toolkit's `src/core`, not a built `dist`) so the test nodes and the test
 * libraries share one module identity — the `WIRE_HANDLERS` symbol and
 * `instanceof` checks only hold when both sides load the same source files.
 *
 * Takes the caller's `__dirname` so paths resolve against the repo root
 * regardless of how vitest loads this module.
 */
export function workspaceAliases(dirname: string): Record<string, string> {
  const r = (p: string): string => path.resolve(dirname, p);
  return {
    "@/core": r("packages/toolkit/src/core"),
    "@/vite": r("packages/toolkit/src/vite"),
    "@/test": r("packages/toolkit/src/test"),
    "@bonsae/nrg-runtime/server": r(
      "packages/toolkit/src/core/server/index.ts",
    ),
    "@bonsae/nrg/server": r("packages/toolkit/src/core/server/index.ts"),
  };
}
