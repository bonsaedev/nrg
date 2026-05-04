import type { RED } from "../types";
import { initNrgAssetsRoute } from "./nrg-assets";

let _initialized = false;

function initRoutes(RED: RED): void {
  if (_initialized) return;
  _initialized = true;

  initNrgAssetsRoute(RED.httpAdmin);
}

export { initRoutes };
