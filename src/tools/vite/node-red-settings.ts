import type { NodeRedSettings } from "../../sdk/lib/server";

/**
 * Type-safe helper for defining the Node-RED runtime settings the nrg dev server
 * spawns Node-RED with (a `node-red.settings.ts` at the project root, picked up
 * by the vite plugin's Node-RED launcher). This is dev tooling — it configures
 * the local Node-RED instance, not the published `@bonsae/nrg-runtime` package.
 *
 * @example
 * ```typescript
 * import { defineNodeRedSettings } from "@bonsae/nrg/vite";
 *
 * export default defineNodeRedSettings({
 *   flowFile: "flows.json",
 *   flowFilePretty: true,
 * });
 * ```
 */
function defineNodeRedSettings(settings: NodeRedSettings): NodeRedSettings {
  return settings;
}

export { defineNodeRedSettings };
export type { NodeRedSettings };
