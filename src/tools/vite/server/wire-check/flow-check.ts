import { compileFlow } from "./compile";
import type { FlowNode, Registry, WireRef } from "./compile";
import { checkProgram } from "./checker";

interface WireVerdict extends WireRef {
  ok: boolean;
  message?: string;
}

interface FlowCheckReport {
  ok: boolean;
  wires: WireVerdict[];
  /** Core/non-nrg node types on wires — the unchecked `any` boundary. */
  uncheckedTypes: string[];
  /** Errors that could not be attributed to a wire (compiler-shape issues). */
  unattributed: string[];
  checkedAt: string;
}

/**
 * Check a full deployed flow config against the registry: compile the graph
 * into a program, type-check it in memory, and attribute every diagnostic back
 * to the wire(s) its line covers. `declarations` are the extractor's local-type
 * declarations, prepended with diagnostic lines offset accordingly. Never
 * throws — a checker failure yields an all-green report with the failure listed
 * as unattributed, so authoring is never blocked (fail open, loudly).
 */
function checkFlowConfig(
  flow: FlowNode[],
  registry: Registry,
  declarations = "",
): FlowCheckReport {
  const checkedAt = new Date().toISOString();
  try {
    const { code, wiresByLine, wires, uncheckedTypes } = compileFlow(
      flow,
      registry,
    );
    const header = declarations
      ? `// local type declarations (extractor)\n${declarations}\n\n`
      : "";
    const offset = header ? header.split("\n").length - 1 : 0;
    const diagnostics = checkProgram(header + code);

    const failed = new Map<string, string>();
    const unattributed: string[] = [];
    for (const d of diagnostics) {
      const refs = wiresByLine.get(d.line - offset);
      if (refs && refs.length) {
        for (const ref of refs) {
          if (!failed.has(ref.id)) failed.set(ref.id, d.message);
        }
      } else {
        unattributed.push(`line ${d.line}: ${d.message}`);
      }
    }

    const verdicts: WireVerdict[] = wires.map((w) => ({
      ...w,
      ok: !failed.has(w.id),
      ...(failed.has(w.id) ? { message: failed.get(w.id) } : {}),
    }));
    return {
      ok: failed.size === 0 && unattributed.length === 0,
      wires: verdicts,
      uncheckedTypes,
      unattributed,
      checkedAt,
    };
  } catch (err) {
    return {
      ok: true, // fail OPEN — never block authoring on a checker failure
      wires: [],
      uncheckedTypes: [],
      unattributed: [
        `checker failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
      checkedAt,
    };
  }
}

/** Terminal-friendly report — what `pnpm dev` prints after every deploy. */
function formatReport(report: FlowCheckReport): string[] {
  const lines: string[] = [];
  const failed = report.wires.filter((w) => !w.ok);
  if (report.uncheckedTypes.length) {
    lines.push(
      `wire-check: unchecked boundary (core/non-nrg): ${report.uncheckedTypes.join(", ")}`,
    );
  }
  for (const w of report.wires) {
    if (w.ok) lines.push(`wire-check: ✔ ${w.label}`);
  }
  for (const w of failed) {
    lines.push(`wire-check: ✖ ${w.label}`);
    if (w.message) lines.push(`wire-check:     ${w.message}`);
  }
  for (const u of report.unattributed) lines.push(`wire-check: ⚠ ${u}`);
  lines.push(
    failed.length === 0 && report.unattributed.length === 0
      ? `wire-check: GREEN — ${report.wires.length} wire(s) type-check`
      : `wire-check: RED — ${failed.length} of ${report.wires.length} wire(s) failed`,
  );
  return lines;
}

export { checkFlowConfig, formatReport };
export type { FlowCheckReport, WireVerdict };
