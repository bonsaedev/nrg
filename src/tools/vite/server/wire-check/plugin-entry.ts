/**
 * The nrg wire-check Node-RED PLUGIN — the dev-loop integration.
 *
 * Shipped inside nrg's dist (`dist/toolkit/type-check-plugin/`) and auto-added
 * to Node-RED's `nodesDir` by the nrg vite launcher, so `pnpm dev` in any nrg
 * package gets flow type-checking with ZERO extra installs:
 *
 *  - on every DEPLOY (`flows:started`) the whole flow config is compiled into
 *    a program (accumulating-record model) and type-checked in memory; the
 *    per-wire verdicts are printed to the Node-RED log — i.e. straight into
 *    the `pnpm dev` terminal;
 *  - `GET  nrg/type-check/status` → `{ available: true }` (the editor's
 *    feature gate — turns the Validate Types controls on);
 *  - `GET  nrg/type-check/flow`   → the latest full report (curl-able);
 *  - `POST nrg/type-check` / `.../batch` → verdicts for specific wires, looked
 *    up from the latest deploy report (the editor's per-wire probes).
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

  // Per-wire probes from the editor: answer from the latest deploy report.
  // The `checked` field is REQUIRED by the client contract — its interactive
  // reject only fires on `{ ok:false, checked:true }`; an unknown (not-yet-
  // deployed) wire fails OPEN with `checked:false` + a reason, so a freshly-drawn
  // wire is "deploy to check", never destructively removed.
  const wireVerdict = (
    id: string,
  ): { ok: boolean; checked: boolean; message?: string; reason?: string } => {
    const hit = latest?.wires.find((w) => w.id === id);
    if (!hit) {
      return {
        ok: true,
        checked: false,
        reason: "unchecked — deploy to type-check this wire",
      };
    }
    return hit.ok
      ? { ok: true, checked: true }
      : { ok: false, checked: true, message: hit.message };
  };

  const parseBody = (
    req: { body?: unknown; on(ev: string, cb: (c?: string) => void): void },
    _res: unknown,
    next: () => void,
  ): void => {
    if (req.body) return next();
    let raw = "";
    req.on("data", (c) => (raw += c ?? ""));
    req.on("end", () => {
      try {
        req.body = JSON.parse(raw || "{}");
      } catch {
        req.body = {};
      }
      next();
    });
  };

  RED.httpAdmin.post(
    "/nrg/type-check",
    read,
    parseBody,
    (req: { body?: { id?: string } }, res: { json(v: unknown): void }) => {
      res.json(wireVerdict(req.body?.id ?? ""));
    },
  );
}

// Node-RED requires the plugin module and CALLS module.exports(RED) directly;
// the build emits a CJS shim (`wire-checker.js`) that unwraps this default.
export default nrgTypeCheckPlugin;
