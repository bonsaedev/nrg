import path from "path";
import fs from "fs";
import type { NodeRedExpressApp, NodeRedRequestHandler } from "../types";

const RESOURCES_DIR = path.resolve(__dirname, "./resources");

const ALLOWED_FILES = new Set([
  "nrg-client.js",
  "vue.esm-browser.prod.js",
  "vue.esm-browser.js",
]);

const handleNrgAsset: NodeRedRequestHandler = (req, res, next) => {
  let fileName = req.params[0];

  // Serve the Vue dev build in development for devtools support
  if (
    fileName === "vue.esm-browser.prod.js" &&
    process.env.NODE_ENV !== "production"
  ) {
    fileName = "vue.esm-browser.js";
  }

  if (!ALLOWED_FILES.has(fileName)) return next();

  const filePath = path.join(RESOURCES_DIR, fileName);
  if (!fs.existsSync(filePath)) return next();

  res.setHeader("Content-Type", "application/javascript");
  fs.createReadStream(filePath).pipe(res);
};

function initNrgAssetsRoute(router: NodeRedExpressApp): void {
  if (!fs.existsSync(RESOURCES_DIR)) return;
  router.get("/nrg/assets/*", handleNrgAsset);
}

export { initNrgAssetsRoute, handleNrgAsset };
