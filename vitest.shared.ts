import path from "path";

/**
 * Resolve aliases shared by every workspace-aware vitest config.
 *
 * `@/*` point at the package sources. The `@bonsae/nrg-runtime/*` subpaths map
 * to the runtime SOURCE (not its built `dist`) so the test nodes and the test
 * libraries share one module identity — the `WIRE_HANDLERS` symbol and
 * `instanceof` checks only hold when both sides load the same source files.
 *
 * Order matters: vite resolves aliases in insertion order, so the longer
 * `/internal/{client,components}` keys must precede the shorter `/internal`.
 *
 * Takes the caller's `__dirname` so paths resolve against the repo root
 * regardless of how vitest loads this module.
 */
export function workspaceAliases(dirname: string): Record<string, string> {
  const r = (p: string): string => path.resolve(dirname, p);
  return {
    "@/core": r("packages/runtime/src"),
    "@/vite": r("packages/toolkit/src/vite"),
    "@/test": r("packages/toolkit/src/test"),
    "@bonsae/nrg-runtime/internal/client": r(
      "packages/runtime/src/internal-client.ts",
    ),
    "@bonsae/nrg-runtime/internal/components": r(
      "packages/runtime/src/internal-components.ts",
    ),
    "@bonsae/nrg-runtime/internal": r("packages/runtime/src/internal.ts"),
    "@bonsae/nrg-runtime/server": r("packages/runtime/src/server/index.ts"),
  };
}
