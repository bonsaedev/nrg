"use strict";

/**
 * `@bonsae/nrg-runtime` combined entry — re-exports the server runtime values
 * and the schema builders so the single `@bonsae/nrg-runtime` specifier carries
 * both planes. The production import rewrite stays plane-specific
 * (`@bonsae/nrg/server` → `@bonsae/nrg-runtime/server`, `@bonsae/nrg/schema` →
 * `@bonsae/nrg-runtime/schema`), so this `.` entry is a convenience that unions
 * the two sibling bundles. Their public exports don't overlap — the server
 * bundle no longer re-exports the schema builders — so the spread is safe.
 *
 * This is a static file copied verbatim into dist/runtime/index.cjs by the
 * build (build/index.ts → emitRuntimeArtifact); it is never bundled.
 */
module.exports = {
  ...require("./server/index.cjs"),
  ...require("./schema/index.cjs"),
};
