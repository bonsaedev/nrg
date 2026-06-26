import path from "path";
import fs from "fs";
import { createRequire } from "module";
import type { NodeRedExpressApp, NodeRedRequestHandler } from "../types";

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
  const vueFile =
    process.env.NODE_ENV !== "production"
      ? _require.resolve("vue/dist/vue.esm-browser.js")
      : _require.resolve("vue/dist/vue.esm-browser.prod.js");

  router.get(
    "/nrg/assets/nrg-client.js",
    serveFile(path.join(resourcesDir, "nrg-client.js")),
  );
  router.get("/nrg/assets/vue.esm-browser.prod.js", serveFile(vueFile));
  router.get("/nrg/assets/vue.esm-browser.js", serveFile(vueFile));
}

export { initAssetsRoutes, serveFile };
