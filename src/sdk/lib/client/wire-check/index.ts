import { buildRequest, wireId, rejectMessage } from "./plan";
import type { EditorLink } from "./plan";
import { isNrgType } from "./registry";
import { checkWire } from "./transport";
import { typeCheckEnabled, refreshTypeCheckAvailability } from "./availability";
import { subscribeFlowReport } from "./report";

/**
 * Editor wire-check integration — a self-registering side-effect module bundled
 * into the shared nrg client asset (imported by client/index.ts, NOT part of the
 * public API). It hooks the Node-RED editor events and drives the pure planner
 * (plan.ts) + the type-check plugin transport (transport.ts):
 *
 *  - `links:add`   → interactive per-wire check; a real mismatch destructively
 *                    removes the wire and explains why (a passing / uncheckable
 *                    wire stays silent, so drawing wires isn't noisy).
 *  - deploy report → the plugin re-checks the WHOLE flow after every deploy
 *                    (flows:started) and PUSHES the per-wire report over
 *                    RED.comms; ./report consumes it — failing wires painted
 *                    red on the canvas plus one notification. (A deploy-event
 *                    sweep would race the server and read stale verdicts.)
 *  - `links:remove`→ cancels an in-flight check for a wire the author just
 *                    deleted, so a late verdict never toasts a gone wire.
 *
 * Gated on {@link typeCheckEnabled}: the hooks only act when the type-check
 * plugin is installed and its `nrgTypeCheck` setting is on (probed once on load).
 * With no plugin the feature is fully dark, and every transport call fails open.
 */

let ready = false;
const pendingAdds: EditorLink[] = [];
let flushScheduled = false;
const inFlight = new Set<string>();
const cancelled = new Set<string>();
let selfRemoving = false;

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  // Coalesce a synchronous burst into one microtask. A flow load / import /
  // paste / subflow-expand adds many links at once; a burst (>1) is programmatic
  // and skipped. A lone add is an interactive wire the author just drew.
  Promise.resolve().then(flushAdds);
}

function flushAdds(): void {
  const links = pendingAdds.splice(0);
  flushScheduled = false;
  if (links.length !== 1) return;
  checkOne(links[0]);
}

function checkOne(link: EditorLink): void {
  const req = buildRequest(link, isNrgType);
  if (!req) return;
  const id = req.id;
  inFlight.add(id);
  checkWire(req).then((result) => {
    inFlight.delete(id);
    if (cancelled.delete(id)) return; // wire deleted mid-check → drop the verdict
    if (!result || !result.checked || result.ok) return; // pass / uncheckable → quiet
    selfRemoving = true;
    try {
      // `link` is a real Node-RED link (a structural superset of EditorLink);
      // widen it back for the removeLink call.
      RED.nodes.removeLink(link as unknown as NodeRED.Link);
      RED.view.redraw(true);
    } catch {
      /* removeLink is best-effort — the toast still explains the mismatch */
    } finally {
      selfRemoving = false;
    }
    RED.notify(rejectMessage(result), { type: "error", timeout: 8000 });
  });
}

function onLinksAdd(link: EditorLink): void {
  if (!ready || !typeCheckEnabled.value) return; // suppress storm / feature off
  pendingAdds.push(link);
  scheduleFlush();
}

function onLinksRemove(link: EditorLink): void {
  if (selfRemoving) return; // our own destructive reject — not a user deletion
  const id = wireId(link);
  if (inFlight.has(id)) cancelled.add(id);
}

function install(): void {
  if (typeof RED === "undefined" || !RED.events) return;
  // Probe the plugin once; publishes to typeCheckEnabled, which gates the hooks
  // below and the node form's Validate Types controls.
  refreshTypeCheckAvailability();
  // The first `flows:load` marks the initial load complete; only then do we act
  // on interactive adds. Later loads (post-deploy) re-fire it harmlessly.
  RED.events.on("flows:load", () => {
    ready = true;
  });
  RED.events.on("links:add", (link: EditorLink) => onLinksAdd(link));
  RED.events.on("links:remove", (link: EditorLink) => onLinksRemove(link));
  subscribeFlowReport();
}

install();
