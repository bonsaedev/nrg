import path from "path";
import fs from "fs";
import type { RED } from "../types";

const MIME: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let _registered = false;

function serveNrgResources(RED: RED): void {
  if (_registered) return;
  _registered = true;

  const clientDir = path.resolve(__dirname, "./resources");
  if (!fs.existsSync(clientDir)) return;

  const httpAdmin = (RED as any).httpAdmin;
  if (!httpAdmin) return;

  // /nrg/assets/ is not handled by Node-RED's editorApp, so our handler
  // appended via use() is reached normally without any stack manipulation.
  httpAdmin.use(function (req: any, res: any, next: any) {
    const prefix = "/nrg/assets/";
    if (!(req.path as string).startsWith(prefix)) return next();
    let reqPath = (req.path as string).slice(prefix.length);
    // Serve the Vue dev build in development for devtools support
    if (
      reqPath === "vue.esm-browser.prod.js" &&
      process.env.NODE_ENV !== "production"
    ) {
      const devPath = path.resolve(clientDir, "vue.esm-browser.js");
      if (fs.existsSync(devPath)) {
        reqPath = "vue.esm-browser.js";
      }
    }
    const filePath = path.resolve(clientDir, reqPath);
    const rel = path.relative(clientDir, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return next();
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
      return next();
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
}

export { serveNrgResources };
