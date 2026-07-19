/**
 * Deploy-report consumer — the editor half of the dev-loop wire check.
 *
 * The wire-check plugin re-checks the WHOLE flow after every deploy
 * (`flows:started`) and pushes the per-wire report over `RED.comms` (retained,
 * so a freshly-opened editor receives the latest verdict immediately). This
 * module subscribes, paints failing wires red on the canvas, and raises one
 * notification — the push arrives when the check has actually FINISHED, unlike
 * a deploy-event sweep, which would race the server and read stale verdicts.
 *
 * NOTE: the deploy report paints EVERY failing wire — it intentionally ignores
 * the per-wire opt-in gate (`plan.shouldCheck`) that filters interactive
 * `links:add` checks. A deploy is a whole-flow verdict; the gate only throttles
 * the live per-wire probes.
 */

interface ReportWire {
  id: string;
  label: string;
  ok: boolean;
  message?: string;
}

interface FlowReport {
  ok: boolean;
  wires: ReportWire[];
  uncheckedTypes: string[];
  unattributed: string[];
  /** The checker hit an internal fault (not a wire mismatch) — the `ok` verdict
   * still stands, but the check wasn't fully clean. */
  internalError?: boolean;
  checkedAt: string;
}

const COMMS_TOPIC = "nrg/type-check";
const ERROR_CLASS = "nrg-wire-type-error";

function isFlowReport(value: unknown): value is FlowReport {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as FlowReport).wires)
  );
}

/** The ids of the failing wires. */
function failedWires(report: FlowReport): ReportWire[] {
  return report.wires.filter((w) => !w.ok);
}

/** One editor notification per report: sticky error listing the failing wires
 * (capped), a brief success toast only when a previous report had failures. */
function reportSummary(
  report: FlowReport,
  previousHadFailures: boolean,
): { text: string; level: "error" | "success" } | null {
  const failed = failedWires(report);
  if (failed.length > 0) {
    const shown = failed.slice(0, 5);
    const items = shown.map((w) => `<li><code>${w.label}</code></li>`).join("");
    const more =
      failed.length > shown.length
        ? `<p>…and ${failed.length - shown.length} more</p>`
        : "";
    return {
      level: "error",
      text: `<p><b>Wire type-check: ${failed.length} wire(s) failed</b></p><ul>${items}</ul>${more}`,
    };
  }
  if (previousHadFailures) {
    return {
      level: "success",
      text: `Wire type-check: all ${report.wires.length} wire(s) green`,
    };
  }
  return null;
}

/** Match a canvas link element's datum against a wire id
 * (`${sourceId}:${sourcePort}:${targetId}` — the same scheme the plan uses). */
function linkDatumId(datum: unknown): string | null {
  const d = datum as
    | {
        source?: { id?: string };
        sourcePort?: number;
        target?: { id?: string };
      }
    | undefined;
  if (!d?.source?.id || d.target?.id === undefined) return null;
  return `${d.source.id}:${d.sourcePort ?? 0}:${d.target.id}`;
}

let cssInjected = false;
function injectCss(): void {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.${ERROR_CLASS} {
  stroke: var(--red-ui-text-color-error, #ad1625) !important;
  stroke-dasharray: 10 4;
  stroke-width: 4px;
}
/* SELECTED error wire — Node-RED tags the link's <g> with .red-ui-flow-link-selected.
   Recolor to the editor's own selection color (keeps the dash so it still reads as an
   error, bumps width so the selection is obvious). Higher specificity + !important so it
   beats the red rule above, which otherwise hides Node-RED's selection styling. */
g.red-ui-flow-link-selected path.${ERROR_CLASS} {
  stroke: var(--red-ui-node-selected-color) !important;
  stroke-width: 5px;
}`;
  document.head.appendChild(style);
}

/** Paint the report onto the canvas: clear our class everywhere, then re-apply
 * to the failing wires. Reads the d3 datum Node-RED stores on each link path —
 * an editor internal, so everything here is best-effort and fails silent. */
function paintReport(report: FlowReport): void {
  if (typeof document === "undefined") return;
  injectCss();
  const failed = new Set(failedWires(report).map((w) => w.id));
  try {
    const links = Array.from(
      document.querySelectorAll(".red-ui-flow-link-line"),
    );
    for (const el of links) {
      const datum = (el as { __data__?: unknown }).__data__;
      const id = linkDatumId(datum);
      if (id && failed.has(id)) el.classList.add(ERROR_CLASS);
      else el.classList.remove(ERROR_CLASS);
    }
  } catch {
    /* canvas internals moved — the notification still carries the verdict */
  }
}

/** A content fingerprint (verdict + which wires failed) — identical reports
 * (a retained re-delivery on reconnect) share it; any change to the verdict or
 * the failing set produces a new one. */
function reportIdentity(report: FlowReport): string {
  return `${report.ok}|${failedWires(report)
    .map((w) => w.id)
    .sort()
    .join(",")}`;
}

let lastReport: FlowReport | null = null;
let lastHadFailures = false;
let lastNotifiedIdentity: string | null = null;

function handleReport(report: FlowReport): void {
  lastReport = report;
  // Painting is idempotent, so always re-apply (the canvas rebuilds its link
  // elements on reconnect/workspace switch).
  paintReport(report);
  // A retained report is re-delivered verbatim on every editor reconnect — don't
  // re-fire the sticky notification for a report we've already announced.
  const identity = reportIdentity(report);
  if (identity === lastNotifiedIdentity) return;
  const summary = reportSummary(report, lastHadFailures);
  lastNotifiedIdentity = identity;
  lastHadFailures = failedWires(report).length > 0;
  if (summary) {
    RED.notify(summary.text, {
      type: summary.level,
      // errors stick until dismissed; the green-again toast auto-clears
      timeout: summary.level === "error" ? 0 : 4000,
    });
  }
}

/** Subscribe to the plugin's deploy reports and keep the canvas painted —
 * re-applying on workspace switches (the view rebuilds its link elements). */
function subscribeFlowReport(): void {
  const red = RED as unknown as {
    comms?: {
      subscribe(topic: string, cb: (t: string, d: unknown) => void): void;
    };
    events?: { on(ev: string, cb: () => void): void };
  };
  if (!red.comms?.subscribe) return; // very old editor — feature off
  red.comms.subscribe(COMMS_TOPIC, (_topic, data) => {
    if (isFlowReport(data)) handleReport(data);
  });
  red.events?.on("workspace:change", () => {
    if (lastReport) paintReport(lastReport);
  });
}

export { subscribeFlowReport, reportSummary, failedWires, linkDatumId };
export type { FlowReport, ReportWire };
