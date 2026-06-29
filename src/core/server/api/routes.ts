import type { RED } from "../nodered";
import { initAssetsRoutes } from "./assets";

let _initialized = false;

function initRoutes(RED: RED): void {
  if (_initialized) return;
  _initialized = true;

  initAssetsRoutes(RED.httpAdmin);
}

export { initRoutes };
