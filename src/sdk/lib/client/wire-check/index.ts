import { subscribeFlowReport } from "./report";

/**
 * Editor wire-check integration — a self-registering side-effect module bundled
 * into the shared nrg client asset (imported by client/index.ts, NOT part of the
 * public API).
 *
 * The wire check is **DEPLOY-ONLY**. A wire's validity depends on the ENTIRE
 * upstream accumulation (every node's Adds merged along the path), not on its two
 * endpoints, so there is no sound per-wire check — only a whole-flow compile. On
 * every deploy (`flows:started`) the dev plugin re-checks the whole flow and
 * PUSHES the per-wire report over `RED.comms`; `./report` consumes it and paints
 * the canvas (failing wires red, typed↔untyped boundaries yellow) plus one
 * notification. There is no interactive per-wire probe and no per-node opt-in —
 * type-checking is simply always on wherever the dev plugin is present, and fully
 * dark (no comms messages) where it is not.
 */
function install(): void {
  if (typeof RED === "undefined") return;
  subscribeFlowReport();
}

install();
