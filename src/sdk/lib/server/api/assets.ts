import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import type { NodeRedExpressApp, NodeRedRequestHandler } from "../red";

// The content-hashed editor client filename (e.g. "nrg.a1b2c3d4.js"), inlined at
// build time by esbuild (build/index.ts injects __NRG_CLIENT_ASSET__ into the
// server bundle). The hash busts the editor's cache across releases. Undefined
// only when this source runs un-bundled (nrg's own tests) — then we fall back to
// the unhashed dev name; no real editor loads that path.
declare const __NRG_CLIENT_ASSET__: string | undefined;
const CLIENT_ASSET =
  typeof __NRG_CLIENT_ASSET__ !== "undefined" ? __NRG_CLIENT_ASSET__ : "nrg.js";

function serveFile(filePath: string): NodeRedRequestHandler {
  return (_req, res, next) => {
    if (!fs.existsSync(filePath)) return next();
    res.setHeader("Content-Type", "application/javascript");
    fs.createReadStream(filePath).pipe(res);
  };
}

function initAssetsRoutes(router: NodeRedExpressApp): void {
  const resourcesDir = path.resolve(__dirname, "./resources");
  if (!fs.existsSync(resourcesDir)) return;

  const _require = createRequire(path.join(__dirname, "package.json"));
  // One vue route, not two. Every client — the consumer bundle and nrg's own
  // editor client — rewrites `vue` imports to `/nrg/assets/vue.js` (client
  // build.ts + build/index.ts), so that is the only URL ever requested. The URL
  // is deliberately build-NEUTRAL: the ENVIRONMENT picks the file *contents*
  // served at it — the dev build (unminified, with warnings) in development, the
  // optimized prod build otherwise — so the URL never claims to be one or the
  // other (it isn't called `.prod.js` while a dev server serves the dev build).
  const vueFile =
    process.env.NODE_ENV !== "production"
      ? _require.resolve("vue/dist/vue.esm-browser.js")
      : _require.resolve("vue/dist/vue.esm-browser.prod.js");

  router.get(
    `/nrg/assets/${CLIENT_ASSET}`,
    serveFile(path.join(resourcesDir, CLIENT_ASSET)),
  );
  router.get("/nrg/assets/vue.js", serveFile(vueFile));
}

export { initAssetsRoutes, serveFile };
