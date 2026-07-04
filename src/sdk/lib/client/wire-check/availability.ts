import { ref } from "vue";
import { fetchStatus } from "./transport";

/**
 * Reactive gate for the whole editor wire-check feature: true only when the
 * type-check plugin is installed (its status route is reachable). A Vue ref so
 * the node form (app.vue) shows/hides the Validate Types controls reactively
 * once the probe resolves; the event hooks read the same flag. Default false, so
 * with no plugin the feature stays completely dark (no toggle, no checks) —
 * exactly "not even configurable unless installed".
 */
const typeCheckEnabled = ref(false);

/** Probe the plugin once on editor load and publish the result. */
async function refreshTypeCheckAvailability(): Promise<void> {
  const status = await fetchStatus();
  typeCheckEnabled.value = status.available;
}

export { typeCheckEnabled, refreshTypeCheckAvailability };
