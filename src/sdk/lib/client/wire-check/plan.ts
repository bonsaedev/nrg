/**
 * Pure planning logic for the editor wire check — no DOM, no `RED`, no `fetch`,
 * so it unit-tests directly. Given an editor link, it decides whether the wire
 * should be checked (the opt-in gate), maps Node-RED's numeric source port to a
 * base index or a built-in port, and builds the request the server expects. The
 * thin browser layer (index.ts) wires these to `RED` events and the transport.
 */

/** The minimal shape of a Node-RED node the planner reads. */
interface NodeLike {
  id: string;
  type: string;
  /** Total output ports (base + enabled built-ins), as the editor tracks them. */
  outputs?: number | string;
  errorPort?: boolean;
  completePort?: boolean;
  statusPort?: boolean;
  validateInputTypes?: boolean;
  validateOutputTypes?: Record<number, boolean>;
  _def?: { set?: { module?: string } };
}

/** A Node-RED `links:add` / `links:remove` payload. */
interface EditorLink {
  source: NodeLike;
  sourcePort: number;
  target: NodeLike;
}

type ResolvedPort =
  | { kind: "base"; index: number }
  | { kind: "complete" }
  | { kind: "error" }
  | { kind: "status" };

// -- request contract (mirrors the server checker's WireCheckRequest; it travels
//    as JSON, and client/vite-tooling are separate bundles so the shape is
//    duplicated rather than imported across the plane boundary) --

type SourcePortInput =
  | { kind: "base"; index: number }
  | { kind: "complete" }
  | { kind: "error" }
  | { kind: "status" };

interface WireEndpoint {
  type: string;
  module?: string;
}

interface WireCheckRequest {
  id: string;
  source: WireEndpoint & { port: SourcePortInput };
  target: WireEndpoint;
}

interface WireCheckResult {
  id: string;
  ok: boolean;
  checked: boolean;
  reason?: string;
  message?: string;
}

/** Built-in output ports in canvas order (matches `computeBuiltinPortOutputs`). */
const BUILTIN_ORDER = ["error", "complete", "status"] as const;

/** The built-in ports enabled on a node, in canvas order. */
function enabledBuiltins(node: NodeLike): (typeof BUILTIN_ORDER)[number][] {
  return BUILTIN_ORDER.filter((kind) => node[`${kind}Port`] === true);
}

/** Base output count = total ports minus the enabled built-in ports. */
function baseOutputCount(node: NodeLike): number {
  return Math.max(0, Number(node.outputs ?? 0) - enabledBuiltins(node).length);
}

/**
 * Map a numeric Node-RED source port to a base index or a built-in port. Base
 * ports come first (`0..base-1`), then the enabled built-ins in error→complete→
 * status order. Returns null for an out-of-range port.
 */
function mapSourcePort(
  node: NodeLike,
  sourcePort: number,
): ResolvedPort | null {
  const base = baseOutputCount(node);
  if (sourcePort < base) return { kind: "base", index: sourcePort };
  const builtin = enabledBuiltins(node)[sourcePort - base];
  return builtin ? { kind: builtin } : null;
}

/**
 * The OR gate: check a base-port wire iff the target opted into input-type
 * validation OR the source opted into output-type validation for that port.
 * A built-in source port is gated by the target's flag alone (there is no
 * per-built-in opt-in on the source).
 */
function shouldCheck(
  source: NodeLike,
  target: NodeLike,
  port: ResolvedPort,
): boolean {
  if (target.validateInputTypes === true) return true;
  return (
    port.kind === "base" && source.validateOutputTypes?.[port.index] === true
  );
}

/** Node-RED's own link id: `source.id:sourcePort:target.id`. */
function wireId(link: EditorLink): string {
  return `${link.source.id}:${link.sourcePort}:${link.target.id}`;
}

/** The owning package to resolve an INSTALLED nrg node — omitted for non-nrg nodes. */
function moduleOf(
  node: NodeLike,
  isNrgType: (type: string) => boolean,
): string | undefined {
  return isNrgType(node.type) ? node._def?.set?.module : undefined;
}

/**
 * Build the server request for a link, or null when the wire should not be
 * checked (port out of range, or neither boundary opted in). `isNrgType` decides
 * whether an endpoint carries a resolvable module (installed nrg node) vs is
 * reported by the server as "not an nrg node".
 */
function buildRequest(
  link: EditorLink,
  isNrgType: (type: string) => boolean,
): WireCheckRequest | null {
  const port = mapSourcePort(link.source, link.sourcePort);
  if (!port) return null;
  if (!shouldCheck(link.source, link.target, port)) return null;

  const sourcePort: SourcePortInput =
    port.kind === "base"
      ? { kind: "base", index: port.index }
      : { kind: port.kind };

  return {
    id: wireId(link),
    source: {
      type: link.source.type,
      module: moduleOf(link.source, isNrgType),
      port: sourcePort,
    },
    target: {
      type: link.target.type,
      module: moduleOf(link.target, isNrgType),
    },
  };
}

/** Red per-wire rejection toast (the tsc mismatch). */
function rejectMessage(result: WireCheckResult): string {
  return `Wire type mismatch — ${result.message ?? "the source output is not assignable to the target input"}`;
}

/** The verbatim "couldn't be validated" line for an unchecked wire. */
function uncheckableMessage(result: WireCheckResult): string {
  return `Type Validation for wire ${result.id} couldn't be done because ${result.reason ?? "the wire could not be resolved"}`;
}

export {
  enabledBuiltins,
  baseOutputCount,
  mapSourcePort,
  shouldCheck,
  wireId,
  moduleOf,
  buildRequest,
  rejectMessage,
  uncheckableMessage,
};
export type {
  NodeLike,
  EditorLink,
  ResolvedPort,
  SourcePortInput,
  WireEndpoint,
  WireCheckRequest,
  WireCheckResult,
};
