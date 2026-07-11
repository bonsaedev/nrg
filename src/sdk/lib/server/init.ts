import { Validator } from "../shared/validator";
import { LaneStore } from "./lane-store";
import { initRoutes } from "./api";
import type { RED } from "./red";

/**
 * Creates `RED.validator` once per runtime and exposes it as a non-enumerable,
 * non-configurable getter with no setter — so it can neither be reassigned
 * (`RED.validator = x` throws) nor redefined, and never leaks into anything that
 * enumerates RED. Guarded so a second call is a no-op.
 */
function initValidator(RED: RED): void {
  if (RED.validator) return;

  const validator = new Validator({
    customKeywords: [
      {
        keyword: "x-nrg-skip-validation",
        schemaType: "boolean",
        valid: true,
      },
      {
        keyword: "x-nrg-node-type",
        type: "string",
        validate: (schemaValue: string, dataValue: string) => {
          if (!dataValue) return true;
          const node = RED.nodes.getNode(dataValue);
          return node?.type === schemaValue;
        },
      },
    ],
    customFormats: {
      "node-id": /^[a-zA-Z0-9-_]+$/,
    },
  });

  Object.defineProperty(RED, "validator", {
    get: () => validator,
    enumerable: false,
    configurable: false,
  });
}

/**
 * Creates the off-the-wire message-lane store (see ./lane-store) once per
 * runtime, exposed like the validator: a non-enumerable, non-configurable getter
 * with no setter. Guarded so a second call is a no-op.
 */
function initLaneStore(RED: RED): void {
  if (RED.laneStore) return;

  const laneStore = new LaneStore();

  Object.defineProperty(RED, "laneStore", {
    get: () => laneStore,
    enumerable: false,
    configurable: false,
  });
}

/**
 * Initializes nrg on a Node-RED runtime — the per-runtime globals (validator +
 * lane store) and the HTTP asset routes — once per runtime, from `registerTypes`.
 *
 * Node-RED calls every installed nrg package's register fn on the SAME `RED`, so
 * every step is idempotent AND ensured INDEPENDENTLY: a validator already put
 * there by a package that registered first (possibly an older nrg with no lane
 * store) must not stop this package from getting its lane store. Each sub-init
 * guards on its own target, so nothing short-circuits the others.
 *
 * The globals sub-inits are exported for the test harness, which sets up only the
 * globals — a unit test serves no HTTP, and pulling the route/asset code (which
 * uses `__dirname`) into the harness's ESM bundle is invalid.
 */
function init(RED: RED): void {
  initValidator(RED);
  initLaneStore(RED);
  initRoutes(RED);
}

export { init, initValidator, initLaneStore };
