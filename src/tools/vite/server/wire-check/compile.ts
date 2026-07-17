/**
 * FLOW → PROGRAM compiler: the wire check under the accumulating-record message
 * model. A flow graph is a program assembled visually — so the checker compiles
 * it back into linear TypeScript (one call per node, wires as arguments) and
 * lets tsc compose the types; a wire error surfaces on the exact call line.
 *
 * Semantics compiled in:
 *  - merge (default): a port's function is `(In) => In & Adds` — the record
 *    accumulates; reset: `(Reads) => Adds` — a fresh record whose type is
 *    knowable WITHOUT its input (pre-declared const), which is also what breaks
 *    feedback-loop circularity by construction.
 *  - context modes resolve PER INSTANCE: flow.json `outputContextModes[idx]`
 *    overrides the registry (author) default; legacy "passthrough" = merge.
 *  - BUILT-IN lifecycle ports (error/complete/status) occupy the slots AFTER
 *    the declared base ports, enabled-only, in that fixed order — the runtime
 *    layout. `complete`'s contribution is the node's `input()` return type.
 *  - core / non-nrg nodes are an UNCHECKED `any` boundary (loudly reported);
 *    the nrg portion of the flow stays checked.
 *  - feedback loops: a join fed by a back-edge is PINNED to its declared reads
 *    (the loop invariant — the standard typed-recursion anchor); every
 *    back-edge wire is checked against it.
 *  - disabled nodes (`d: true`) and wires to missing targets deliver nothing.
 */

interface RegistryPort {
  name: string;
  /** The port's ADDS — the named fields this port merges onto the record. */
  adds: string;
  /** Author-declared reset default (a fresh record per emission). */
  reset?: boolean;
}

interface RegistryEntry {
  /** No input port — a source/trigger node; its outputs are input-independent. */
  source?: boolean;
  /** The node's READS — the fields its input() consumes off the record. */
  reads: string;
  ports: RegistryPort[];
  /** input()'s return type — the builtin complete port's record contribution. */
  complete?: string;
  /** Synthesized for core/non-nrg types: an unchecked `any` boundary. */
  unknown?: boolean;
}

type Registry = Record<string, RegistryEntry>;

/** A Node-RED flow-config node (tab entries included; the compiler skips them). */
interface FlowNode {
  id: string;
  type: string;
  z?: string;
  name?: string;
  /** Disabled — receives and delivers nothing. */
  d?: boolean;
  wires?: string[][];
  outputContextModes?: Record<number, string>;
  errorPort?: boolean;
  completePort?: boolean;
  statusPort?: boolean;
  [key: string]: unknown;
}

/** One checkable wire an emitted line covers (ids match the editor's plan:
 * `${sourceId}:${sourcePort}:${targetId}`). */
interface WireRef {
  id: string;
  label: string;
}

interface CompiledFlow {
  code: string;
  /** Emitted-line number (1-based) → the wires that line checks. */
  wiresByLine: Map<number, WireRef[]>;
  /** Every checkable wire in the flow (for reporting the green ones too). */
  wires: WireRef[];
  /** Core/non-nrg node types that are wired — the unchecked `any` boundary. */
  uncheckedTypes: string[];
}

const ERROR_ADDS = "{ error: { name: string; message: string } }";
const STATUS_ADDS =
  "{ status: { fill?: string; shape?: string; text?: string } | string }";

const ident = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, "_");

function compileFlow(flow: FlowNode[], registry: Registry): CompiledFlow {
  // tabs out; DISABLED nodes out (they receive nothing, deliver nothing)
  const nodes = flow.filter((n) => n.type !== "tab" && n.d !== true);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const unknownTypes = new Set<string>();
  const defFor = (n: FlowNode): RegistryEntry => {
    const def = registry[n.type];
    if (def) return def;
    return {
      unknown: true,
      reads: "any",
      ports: (n.wires ?? []).map((_, i) => ({
        name: `out${i}`,
        adds: "any",
        reset: true, // pre-declared `any` — nothing is verified through it
      })),
    };
  };

  interface ResolvedPort extends RegistryPort {
    instanceReset?: boolean;
  }
  const portAt = (n: FlowNode, idx: number): ResolvedPort => {
    const def = defFor(n);
    if (idx < def.ports.length) {
      const p = def.ports[idx];
      const mode = n.outputContextModes?.[idx];
      const reset = mode !== undefined ? mode === "reset" : (p.reset ?? false);
      return { ...p, reset, instanceReset: reset && !p.reset };
    }
    const builtinSlots: (RegistryPort | null)[] = [
      n.errorPort ? { name: "error", adds: ERROR_ADDS, reset: true } : null,
      n.completePort
        ? { name: "complete", adds: def.complete ?? "unknown", reset: true }
        : null,
      n.statusPort ? { name: "status", adds: STATUS_ADDS, reset: true } : null,
    ];
    const builtins = builtinSlots.filter((b): b is RegistryPort => b !== null);
    const b = builtins[idx - def.ports.length];
    if (!b) {
      throw new Error(
        `${n.name ?? n.id}: wires[${idx}] addresses no port (declared ${def.ports.length}, enabled builtins ${builtins.length})`,
      );
    }
    return b;
  };

  interface Edge {
    src: string;
    srcPort: number;
    dst: string;
    back: boolean;
  }
  const edges: Edge[] = [];
  for (const n of nodes) {
    (n.wires ?? []).forEach((targets, pi) => {
      for (const t of targets) {
        if (byId.has(t))
          edges.push({ src: n.id, srcPort: pi, dst: t, back: false });
        // wires into disabled/missing nodes deliver nothing — dropped
      }
    });
  }
  const incoming = new Map<string, Edge[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) incoming.get(e.dst)!.push(e);
  const outgoing = new Map<string, Edge[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) outgoing.get(e.src)!.push(e);

  // wired unknown types = the reported boundary (unwired config nodes are noise)
  for (const e of edges) {
    for (const end of [byId.get(e.src)!, byId.get(e.dst)!]) {
      if (!registry[end.type]) unknownTypes.add(end.type);
    }
  }

  const isPass1Edge = (e: Edge): boolean => {
    const s = byId.get(e.src)!;
    return Boolean(defFor(s).source) || Boolean(portAt(s, e.srcPort).reset);
  };

  // back-edge detection (DFS grey-edge); pass-1 edges can't create inference cycles
  {
    const color = new Map<string, number>(nodes.map((n) => [n.id, 0]));
    const dfs = (id: string): void => {
      color.set(id, 1);
      for (const e of outgoing.get(id)!) {
        if (isPass1Edge(e)) continue;
        const c = color.get(e.dst);
        if (c === 1) e.back = true;
        else if (c === 0) dfs(e.dst);
      }
      color.set(id, 2);
    };
    for (const n of nodes) if (color.get(n.id) === 0) dfs(n.id);
  }
  const backEdges = edges.filter((e) => e.back);
  const pinned = new Set(backEdges.map((e) => e.dst));

  const wireRef = (e: Edge): WireRef => {
    const s = byId.get(e.src)!;
    const t = byId.get(e.dst)!;
    return {
      id: `${e.src}:${e.srcPort}:${e.dst}`,
      label: `${s.name ?? s.id}[${portAt(s, e.srcPort).name}] -> ${t.name ?? t.id}`,
    };
  };
  const allWires = edges.map(wireRef);

  const lines: string[] = [];
  const wiresByLine = new Map<number, WireRef[]>();
  const push = (text: string, wires?: WireRef[]): void => {
    lines.push(text);
    if (wires && wires.length) wiresByLine.set(lines.length, wires);
  };

  push(
    `// nrg wire check — the flow compiled as a program (accumulating record model)`,
  );
  push(
    `declare function fanIn<T extends readonly unknown[]>(...xs: T): T[number];`,
  );
  push("");
  if (unknownTypes.size) {
    push(
      `// UNCHECKED BOUNDARY — core/non-nrg types treated as \`any\`: ${[...unknownTypes].join(", ")}`,
    );
    push("");
  }

  // (1) declared functions — known registry types (+ `__reset` variants for
  //     ports an INSTANCE flips to reset via outputContextModes)
  const instanceResetCombos = new Set<string>();
  for (const n of nodes) {
    const def = registry[n.type];
    if (!def || def.source) continue;
    def.ports.forEach((p, i) => {
      if (portAt(n, i).instanceReset)
        instanceResetCombos.add(`${n.type}:${p.name}`);
    });
  }
  for (const t of [...new Set(nodes.map((n) => n.type))]) {
    const def = registry[t];
    const fn = ident(t);
    if (!def) {
      // an unknown SINK still gets a callable so its incoming wires stay visible
      if (
        nodes.some(
          (n) =>
            n.type === t &&
            !(n.wires ?? []).some((w) => w.length) &&
            (incoming.get(n.id)?.length ?? 0) > 0,
        )
      ) {
        push(
          `declare function n_${fn}(m: any): void; // core node — unchecked`,
        );
      }
      continue;
    }
    if (def.ports.length === 0) {
      push(`declare function n_${fn}(m: ${def.reads}): void; // sink`);
    } else if (!def.source) {
      for (const p of def.ports) {
        push(
          p.reset
            ? `declare function n_${fn}_${ident(p.name)}(m: ${def.reads}): ${p.adds}; // RESET port`
            : `declare function n_${fn}_${ident(p.name)}<In extends ${def.reads}>(m: In): In & ${p.adds};`,
        );
        if (instanceResetCombos.has(`${t}:${p.name}`)) {
          push(
            `declare function n_${fn}_${ident(p.name)}__reset(m: ${def.reads}): ${p.adds}; // flow-author context-mode override`,
          );
        }
      }
    }
  }
  push("");

  // (2) pass 1 — every WIRED port whose output is knowable without input
  for (const n of nodes) {
    (n.wires ?? []).forEach((targets, pi) => {
      if (!targets.length) return;
      const p = portAt(n, pi);
      if (defFor(n).source || p.reset) {
        push(
          `declare const m_${ident(n.id)}_${ident(p.name)}: ${p.adds}; // "${n.name ?? n.id}"`,
        );
      }
    });
  }
  for (const id of pinned) {
    const n = byId.get(id)!;
    push(
      `declare const pin_${ident(id)}: ${defFor(n).reads}; // loop invariant = declared reads of "${n.name ?? n.id}"`,
    );
  }
  push("");

  // (3) topological emission — back-edges and pass-1 edges don't constrain order
  const ordering = (e: Edge): boolean => !isPass1Edge(e) && !e.back;
  const needsEmit = nodes.filter((n) => !defFor(n).source);
  const indeg = new Map(
    needsEmit.map((n) => [n.id, incoming.get(n.id)!.filter(ordering).length]),
  );
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = needsEmit.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const e of outgoing.get(id)!) {
      if (ordering(e) && indeg.has(e.dst)) {
        indeg.set(e.dst, indeg.get(e.dst)! - 1);
        if (indeg.get(e.dst) === 0) queue.push(e.dst);
      }
    }
  }
  const leftover = needsEmit.map((n) => n.id).filter((id) => !seen.has(id));

  const portRef = (e: Edge): string =>
    `m_${ident(e.src)}_${ident(portAt(byId.get(e.src)!, e.srcPort).name)}`;
  const inputExpr = (n: FlowNode): string | null => {
    const refs = incoming
      .get(n.id)!
      .filter((e) => !e.back)
      .map(portRef);
    if (pinned.has(n.id)) refs.push(`pin_${ident(n.id)}`);
    if (refs.length === 0) return null;
    return refs.length === 1 ? refs[0] : `fanIn(${refs.join(", ")})`;
  };
  const inWires = (n: FlowNode): WireRef[] =>
    incoming
      .get(n.id)!
      .filter((e) => !e.back)
      .map(wireRef);

  const deferred: { text: string; wires: WireRef[] }[] = [];
  for (const id of [...order, ...leftover]) {
    const n = byId.get(id)!;
    const def = defFor(n);
    const IN = inputExpr(n);
    const fn = ident(n.type);
    if (def.unknown) {
      if (def.ports.length === 0 && IN) {
        push(`n_${fn}(${IN}); // (unchecked)`, []);
      }
      continue;
    }
    if (def.ports.length === 0) {
      if (IN) push(`n_${fn}(${IN});`, inWires(n));
      continue;
    }
    // per-PORT emission with INSTANCE-resolved modes
    const resolved = def.ports.map((_, i) => portAt(n, i));
    const fnOf = (p: ResolvedPort): string =>
      `n_${fn}_${ident(p.name)}${p.instanceReset ? "__reset" : ""}`;
    const normal = resolved.filter((p) => !p.reset);
    for (const p of normal) {
      push(
        `const m_${ident(id)}_${ident(p.name)} = ${fnOf(p)}(${IN});`,
        inWires(n),
      );
    }
    if (normal.length === 0 && IN) {
      deferred.push({
        text: `${fnOf(resolved[0])}(${IN}); // input check (reset-only node)`,
        wires: inWires(n),
      });
    }
  }
  for (const e of backEdges) {
    const v = byId.get(e.dst)!;
    deferred.push({
      text: `null! as ${defFor(v).reads} satisfies ${defFor(v).reads}; // placeholder`,
      wires: [],
    });
    // the back-edge wire must satisfy the join's loop invariant
    deferred.pop();
    deferred.push({
      text: `((x: ${defFor(v).reads}): void => void x)(${portRef(e)}); // back-edge: loop invariant`,
      wires: [wireRef(e)],
    });
  }
  if (deferred.length) {
    push("");
    for (const d of deferred) push(d.text, d.wires);
  }
  push("");
  push("export {};");

  return {
    code: lines.join("\n"),
    wiresByLine,
    wires: allWires,
    uncheckedTypes: [...unknownTypes],
  };
}

export { compileFlow };
export type {
  Registry,
  RegistryEntry,
  RegistryPort,
  FlowNode,
  WireRef,
  CompiledFlow,
};
