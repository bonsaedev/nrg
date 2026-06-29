import type { NodeRedRuntimeSettings } from "./core/server";

export type { NodeRedRuntimeSettings } from "./core/server";

/**
 * Type-safe helper for defining Node-RED runtime settings.
 *
 * @example
 * ```typescript
 * import { defineRuntimeSettings } from "@bonsae/nrg";
 *
 * export default defineRuntimeSettings({
 *   flowFile: "flows.json",
 *   flowFilePretty: true,
 * });
 * ```
 */
export function defineRuntimeSettings(
  settings: NodeRedRuntimeSettings,
): NodeRedRuntimeSettings {
  return settings;
}
