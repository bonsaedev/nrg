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
  /** The checker itself hit a fault (a compile throw, or diagnostics it couldn't
   * pin to a wire) — the WIRING verdict (`ok`) is still authoritative, but this
   * flags that the check was NOT fully clean, distinct from a genuine pass. */
  internalError: boolean;
  checkedAt: string;
}

/**
 * Check a full deployed flow config against the registry: compile the graph
 * into a program, type-check it in memory, and attribute every diagnostic back
 * to the wire(s) its line covers. `declarations` are the extractor's local-type
 * declarations, prepended with diagnostic lines offset accordingly. `srcDir` is
 * the consumer's server source — passing it lets the checker resolve the
 * consumer's own dependencies (external node port types) via its tsconfig.
 * Never throws — a checker failure yields an all-green report with the failure
 * listed as unattributed, so authoring is never blocked (fail open, loudly).
 */
function checkFlowConfig(
  flow: FlowNode[],
  registry: Registry,
  declarations = "",
  srcDir?: string,
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
    const diagnostics = checkProgram(header + code, srcDir);

    const failed = new Map<string, string>();
    const unattributed: string[] = [];
    for (const d of diagnostics) {
      // TS2559 ("Type X has no properties in common with type Y") is TypeScript's
      // WEAK-TYPE heuristic: it fires only when the reader's input is all-optional
      // AND the source shares no keys. In the accumulating-record model that means
      // the reader's optional fields are simply absent upstream — a VALID wire, not
      // a mismatch (a missing REQUIRED field is TS2345; a wrong type on a shared key
      // is also TS2345). So this diagnostic is a false positive here — skip it.
      if (d.code === 2559) continue;
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
    // `ok` reflects the WIRING only — an unattributed diagnostic (a garbled
    // extracted type, an unresolved consumer dependency, or a checker-shape
    // issue) is an INTERNAL fault, reported on its own channel; it must never
    // paint an otherwise-valid flow red. Otherwise one imperfectly-extracted
    // node type would red every wire in the editor.
    return {
      ok: failed.size === 0,
      wires: verdicts,
      uncheckedTypes,
      unattributed,
      internalError: unattributed.length > 0,
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
      internalError: true,
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
  for (const u of report.unattributed) {
    lines.push(`wire-check: ⚠ internal (not a wire fault): ${u}`);
  }
  lines.push(
    failed.length === 0
      ? `wire-check: GREEN — ${report.wires.length} wire(s) type-check`
      : `wire-check: RED — ${failed.length} of ${report.wires.length} wire(s) failed`,
  );
  return lines;
}

export { checkFlowConfig, formatReport };
export type { FlowCheckReport, WireVerdict };
