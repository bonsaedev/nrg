/**
 * The nrg wire-check Node-RED PLUGIN — the dev-loop integration.
 *
 * Shipped inside nrg's dist (`dist/toolkit/type-check-plugin/`) and auto-added
 * to Node-RED's `nodesDir` by the nrg vite launcher, so `pnpm dev` in any nrg
 * package gets flow type-checking with ZERO extra installs:
 *
 * The check is DEPLOY-ONLY — a wire's validity depends on the whole upstream
 * accumulation, not its two endpoints, so there is no per-wire probe and no
 * per-node opt-in:
 *  - on every DEPLOY (`flows:started`) the whole flow config is compiled into
 *    a program (accumulating-record model) and type-checked in memory; the
 *    per-wire verdicts are printed to the Node-RED log (the `pnpm dev` terminal)
 *    AND pushed over `RED.comms` so the editor paints the canvas;
 *  - `GET  nrg/type-check/status` → `{ available: true }` (health/introspection);
 *  - `GET  nrg/type-check/flow`   → the latest full report (curl-able).
 *
 * The registry (node types → reads/adds) is built ONCE per process from the
 * package's server source via the production extractor; the dev loop restarts
 * Node-RED on rebuild, so it can never go stale. Everything fails OPEN — a
 * checker problem must never block authoring.
 */
import path from "node:path";
import { buildRegistry } from "./registry";
import type { BuiltRegistry } from "./registry";
import { checkFlowConfig, formatReport } from "./flow-check";
import type { FlowCheckReport } from "./flow-check";
import type { FlowNode } from "./compile";

interface NodeRedRuntime {
  nodes: { eachNode(cb: (node: FlowNode) => void): void };
  events: { on(event: string, cb: () => void): void };
  comms?: { publish(topic: string, data: unknown, retain?: boolean): void };
  log: { info(msg: string): void; warn(msg: string): void };
  plugins: { registerPlugin(id: string, def: object): void };
  auth: { needsPermission(perm: string): unknown };
  httpAdmin: {
    get(route: string, ...handlers: unknown[]): void;
    post(route: string, ...handlers: unknown[]): void;
  };
}

function nrgTypeCheckPlugin(RED: NodeRedRuntime): void {
  const srcDir =
    process.env.NRG_WIRE_CHECK_SRC ?? path.join(process.cwd(), "src/server");

  let built: BuiltRegistry | null = null;
  let buildError: string | null = null;
  let latest: FlowCheckReport | null = null;

  const registryReady = (async () => {
    try {
      built = buildRegistry(srcDir);
      RED.log.info(
        `[nrg-wire-check] registry ready — ${built.types.length} node type(s) from ${srcDir}`,
      );
    } catch (err) {
      buildError = err instanceof Error ? err.message : String(err);
      RED.log.warn(
        `[nrg-wire-check] registry unavailable (${buildError}) — checks disabled`,
      );
    }
  })();

  async function runCheck(): Promise<void> {
    await registryReady;
    if (!built) return;
    const flow: FlowNode[] = [];
    RED.nodes.eachNode((n) => flow.push({ ...n }));
    latest = checkFlowConfig(flow, built.registry, built.declarations, srcDir);
    for (const line of formatReport(latest)) RED.log.info(line);
    // Push the finished report to the editor (retained: a freshly-opened
    // editor immediately receives the latest verdict) — ./report on the client
    // paints failing wires red and raises one notification.
    try {
      RED.comms?.publish("nrg/type-check", latest, true);
    } catch {
      /* comms unavailable (tests, embedded runtimes) — terminal report stands */
    }
  }

  RED.events.on("flows:started", () => {
    void runCheck().catch((err) => {
      RED.log.warn(`[nrg-wire-check] check failed: ${String(err)}`);
    });
  });

  RED.plugins.registerPlugin("nrg-type-check", {
    type: "nrg-type-check",
    onadd: () => RED.log.info("[nrg-wire-check] plugin registered"),
  });

  // ── admin routes (same base the shipped editor client probes) ──────────────
  // NOTE: under the default `nrg dev` settings there is no adminAuth, so
  // `needsPermission` is a pass-through — these routes are effectively open on
  // the loopback dev bind. That's fine for the design-time dev feature; a
  // hardened/remote Node-RED that ships this plugin should enable adminAuth.
  const read = RED.auth.needsPermission("flows.read");

  RED.httpAdmin.get(
    "/nrg/type-check/status",
    read,
    (_req: unknown, res: { json(v: unknown): void }) => {
      res.json({
        available: built !== null,
        model: "accumulating-record",
        ...(buildError ? { error: buildError } : {}),
      });
    },
  );

  RED.httpAdmin.get(
    "/nrg/type-check/flow",
    read,
    (_req: unknown, res: { json(v: unknown): void }) => {
      res.json(latest ?? { ok: true, wires: [], pending: true });
    },
  );
  // No per-wire POST route: the check is DEPLOY-ONLY. The whole-flow report is
  // pushed over RED.comms on every deploy and the editor paints from it; there is
  // no interactive per-wire probe (a wire's validity needs the whole upstream
  // accumulation, not its two endpoints — see the deploy-only design).
}

// Node-RED requires the plugin module and CALLS module.exports(RED) directly;
// the build emits a CJS shim (`wire-checker.js`) that unwraps this default.
export default nrgTypeCheckPlugin;
