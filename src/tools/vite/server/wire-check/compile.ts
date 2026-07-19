/**
 * FLOW → PROGRAM compiler: the wire check under the accumulating-record message
 * model. A flow graph is a program assembled visually — so the checker compiles
 * it back into linear TypeScript (one call per node, wires as arguments) and
 * lets tsc compose the types; a wire error surfaces on the exact call line.
 *
 * Semantics compiled in:
 *  - the message is always the accumulating record: a data port's function is
 *    `<In extends Reads>(In) => In & Adds` — the record accumulates, nothing
 *    upstream is lost. (The record always merges — a flow author who needs a
 *    fresh message uses a core `change`/`set` node.)
 *  - some ports' output is knowable WITHOUT their input, so they're emitted as
 *    pre-declared consts (which is also what breaks feedback-loop circularity by
 *    construction): SOURCE nodes (no input port), the UNCHECKED `any` boundary
 *    (core/non-nrg types), and the BUILT-IN lifecycle ports.
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
  /** INTERNAL: this port's output is knowable without its input, so it's emitted
   * as a pre-declared const of type `adds` rather than `In & adds`. Set by the
   * compiler for the `any` boundary and source nodes' built-in lifecycle ports —
   * never an author choice (the record always merges). */
  standalone?: boolean;
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

/** A full source-port → target-input CONNECTION for human reporting: the ordered
 * raw editor wires it traverses (`wireIds`) and a combined label that splices any
 * junction waypoints back IN (`Src[port] -> Junction -> Target`). One path per
 * source→target route; it fails iff ANY raw wire it traverses fails (whole-path
 * red). Distinct from `wires` — the per-raw-wire verdicts the editor paints. */
interface WirePath {
  id: string;
  label: string;
  wireIds: string[];
}

interface CompiledFlow {
  code: string;
  /** Emitted-line number (1-based) → the wires that line checks. */
  wiresByLine: Map<number, WireRef[]>;
  /** Every checkable wire in the flow (for reporting the green ones too), keyed
   * by raw editor-wire id — what the editor paints per wire. */
  wires: WireRef[];
  /** Node-to-node connection PATHS for the human report: junctions spliced back
   * in as waypoints, one entry per source→target route. */
  paths: WirePath[];
  /** Core/non-nrg node types that are wired — the unchecked `any` boundary. */
  uncheckedTypes: string[];
  /** Wires that flow into a junction whose outputs reach no node input — a
   * structural (not type) fault, red on its own with a fixed message. */
  deadWires: WireRef[];
}

// The built-in error/status port additions. ERROR_ADDS mirrors the SDK
// `ErrorInfo` ({ name, message, stack? }); STATUS_ADDS's loose `fill?`/`shape?`
// is a sound widening of the SDK's constrained unions (readers accept more).
const ERROR_ADDS =
  "{ error: { name: string; message: string; stack?: string } }";
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
        standalone: true, // pre-declared `any` — nothing is verified through it
      })),
    };
  };

  const portAt = (n: FlowNode, idx: number): RegistryPort => {
    const def = defFor(n);
    if (idx < def.ports.length) {
      const p = def.ports[idx];
      // A data port typed `unknown` is an UNTYPED output (no declared shape) —
      // treat it as `any` so it's an unchecked boundary, not a strict `unknown`
      // that would falsely red every typed downstream reader.
      return {
        ...p,
        adds: p.adds === "unknown" ? "any" : p.adds,
        standalone: p.standalone ?? false,
      };
    }
    // Built-in lifecycle ports MERGE onto the processed record at runtime
    // (#emitLifecycle: error = record + {error}, complete = record + returned
    // fields, status = record + {status}) — so they carry the node's input just
    // like a data port. Only a SOURCE node (no input record to carry) emits them
    // adds-only (output-independent). `complete`'s adds is `input()`'s return;
    // when void it's `unknown`, so the merge `In & unknown` = In forwards the
    // record unchanged (a source with no return falls back to `any`, unchecked).
    const src = Boolean(def.source);
    const builtinSlots: (RegistryPort | null)[] = [
      n.errorPort ? { name: "error", adds: ERROR_ADDS, standalone: src } : null,
      n.completePort
        ? {
            name: "complete",
            adds: def.complete ?? (src ? "any" : "unknown"),
            standalone: src,
          }
        : null,
      n.statusPort
        ? { name: "status", adds: STATUS_ADDS, standalone: src }
        : null,
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

  // The built-in lifecycle ports this node ENABLES and WIRES — in the fixed
  // error → complete → status order, each occupying the slot after the data
  // ports. Only these need a merge-function emission (a non-source node's
  // built-in output carries the record, like a data port).
  const wiredBuiltinsOf = (n: FlowNode): string[] => {
    const def = registry[n.type];
    if (!def || def.source) return [];
    const names: string[] = [];
    let slot = def.ports.length;
    for (const [on, name] of [
      [n.errorPort, "error"],
      [n.completePort, "complete"],
      [n.statusPort, "status"],
    ] as const) {
      if (on) {
        if ((n.wires?.[slot]?.length ?? 0) > 0) names.push(name);
        slot++;
      }
    }
    return names;
  };

  interface Edge {
    src: string;
    srcPort: number;
    dst: string;
    back: boolean;
  }
  // A JUNCTION is a pure passthrough — Node-RED fans a message to all its outputs
  // UNCHANGED. So the wire check treats it as TRANSPARENT: splice it out and let a
  // source's real output type flow THROUGH to the real downstream input, instead of
  // erasing to `any` like a `change`/`function` node (which can rewrite the record).
  // Each spliced edge remembers the full PATH of real editor wires it stands for
  // (source→junction, junction→…→target), so one verdict reds the whole path.
  const junctions = new Set(
    nodes.filter((n) => n.type === "junction").map((n) => n.id),
  );
  // A WireRef whose id matches the editor's link id (`src:port:dst`).
  const rawRef = (src: string, srcPort: number, dst: string): WireRef => {
    const s = byId.get(src)!;
    const t = byId.get(dst)!;
    return {
      id: `${src}:${srcPort}:${dst}`,
      label: `${s.name ?? s.id}[${portAt(s, srcPort).name}] -> ${t.name ?? t.id}`,
    };
  };
  const rawTargets = (id: string): { port: number; dst: string }[] => {
    const out: { port: number; dst: string }[] = [];
    (byId.get(id)?.wires ?? []).forEach((targets, pi) => {
      for (const t of targets) if (byId.has(t)) out.push({ port: pi, dst: t });
    });
    return out;
  };
  // Does junction `jId` reach any real (non-junction) node input downstream?
  // Memoized + cycle-safe (a pure-junction cycle reaches nothing → false).
  const reachMemo = new Map<string, boolean>();
  const reachesReal = (jId: string, stack = new Set<string>()): boolean => {
    const memo = reachMemo.get(jId);
    if (memo !== undefined) return memo;
    if (stack.has(jId)) return false;
    stack.add(jId);
    let reaches = false;
    for (const { dst } of rawTargets(jId)) {
      if (!junctions.has(dst) || reachesReal(dst, stack)) {
        reaches = true;
        break;
      }
    }
    stack.delete(jId);
    reachMemo.set(jId, reaches);
    return reaches;
  };
  // Resolve a junction's outputs to real targets, each with the via-path of real
  // wires taken to reach it (through junction→junction chains, cycle-guarded).
  const resolveJunction = (
    jId: string,
    prefix: WireRef[],
    stack = new Set<string>(),
  ): { target: string; via: WireRef[] }[] => {
    if (stack.has(jId)) return [];
    stack.add(jId);
    const out: { target: string; via: WireRef[] }[] = [];
    for (const { port, dst } of rawTargets(jId)) {
      const via = [...prefix, rawRef(jId, port, dst)];
      if (junctions.has(dst)) out.push(...resolveJunction(dst, via, stack));
      else out.push({ target: dst, via });
    }
    stack.delete(jId);
    return out;
  };

  const edges: Edge[] = [];
  const edgeVia = new Map<Edge, WireRef[]>();
  const deadWiresById = new Map<string, WireRef>();
  for (const n of nodes) {
    if (junctions.has(n.id)) continue; // junction outgoing wires are spliced below
    (n.wires ?? []).forEach((targets, pi) => {
      for (const t of targets) {
        if (!byId.has(t)) continue; // disabled/missing target — delivers nothing
        const first = rawRef(n.id, pi, t);
        if (!junctions.has(t)) {
          const e: Edge = { src: n.id, srcPort: pi, dst: t, back: false };
          edges.push(e);
          edgeVia.set(e, [first]);
        } else if (reachesReal(t)) {
          for (const { target, via } of resolveJunction(t, [first])) {
            const e: Edge = {
              src: n.id,
              srcPort: pi,
              dst: target,
              back: false,
            };
            edges.push(e);
            edgeVia.set(e, via);
          }
        } else {
          deadWiresById.set(first.id, first); // into a junction that goes nowhere
        }
      }
    });
  }
  // A wire INTO a dead junction FROM another junction is dead too — the whole path
  // is wrong, not just the source's first hop.
  for (const jId of junctions) {
    for (const { port, dst } of rawTargets(jId)) {
      if (junctions.has(dst) && !reachesReal(dst)) {
        const w = rawRef(jId, port, dst);
        deadWiresById.set(w.id, w);
      }
    }
  }
  const viaOf = (e: Edge): WireRef[] => edgeVia.get(e) ?? [];
  // Every real editor wire, so the report lists the green ones too and every
  // verdict (type or structural) attributes to a wire the editor can paint.
  const allWires: WireRef[] = [];
  for (const n of nodes) {
    (n.wires ?? []).forEach((targets, pi) => {
      for (const t of targets) {
        if (byId.has(t)) allWires.push(rawRef(n.id, pi, t));
      }
    });
  }

  // Node-to-node PATHS for the human report: each spliced edge carries the full
  // ordered `via` of raw wires it stands for (source→junction→…→target), so we
  // stitch the junction waypoints back into ONE label — `Src[port] -> J -> Target`
  // — instead of logging each raw hop on its own line. A dead-end junction wire
  // has no real target, so it shows as its own broken path.
  const pathLabelFor = (via: WireRef[]): string => {
    let label = via[0].label; // already `Src[port] -> firstHopTarget`
    for (let i = 1; i < via.length; i++) {
      const dst = via[i].id.split(":")[2]; // id = `src:port:dst`
      label += ` -> ${byId.get(dst)?.name ?? dst}`;
    }
    return label;
  };
  const paths: WirePath[] = [];
  const pathSeen = new Set<string>();
  const addPath = (via: WireRef[]): void => {
    if (!via.length) return;
    const wireIds = via.map((v) => v.id);
    const key = wireIds.join("|");
    if (pathSeen.has(key)) return;
    pathSeen.add(key);
    paths.push({
      id: wireIds[wireIds.length - 1],
      label: pathLabelFor(via),
      wireIds,
    });
  };
  for (const e of edges) addPath(viaOf(e));
  for (const w of deadWiresById.values()) addPath([w]);

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
    return (
      Boolean(defFor(s).source) || Boolean(portAt(s, e.srcPort).standalone)
    );
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

  // The built-in lifecycle ports a non-source type needs FUNCTION decls for —
  // any instance that enables + wires one. Their output MERGES the record just
  // like a data port (see portAt), so they're emitted as `In & adds` functions.
  const builtinAdds = (def: RegistryEntry, name: string): string =>
    name === "error"
      ? ERROR_ADDS
      : name === "status"
        ? STATUS_ADDS
        : (def.complete ?? "unknown");
  const builtinsByType = new Map<string, Set<string>>();
  for (const n of nodes) {
    const names = wiredBuiltinsOf(n);
    if (!names.length) continue;
    const set = builtinsByType.get(n.type) ?? new Set<string>();
    for (const name of names) set.add(name);
    builtinsByType.set(n.type, set);
  }

  // (1) declared functions — known registry types
  // A merge port is `<In extends reads>(m: In): Omit<In, keyof Adds> & Adds` —
  // LAST-WRITER-WINS: the runtime spread `{ ...incoming, ...additions }`
  // OVERWRITES colliding keys, so the type drops the overwritten keys from In
  // before intersecting (a plain `In & Adds` would collapse a re-added key to
  // `In[k] & Adds[k]`, e.g. `never`).
  //
  // `failOpen` — lifecycle ports ONLY: when `In` is `any` (an upstream core/non-nrg
  // node erased the record), keep the output `any` so the wire stays UNCHECKED.
  // A DATA port re-anchors to its declared `Adds` past such a boundary — its Adds is
  // the node's contract, so a genuine downstream mismatch is still caught. A
  // LIFECYCLE port (error/complete/status) instead carries the whole RECORD plus a
  // small framework add ({error}/return value/{status}); its handler reads carried
  // context, so re-anchoring to that tiny add would drop the carried keys and
  // manufacture false failures (e.g. a `complete` into a node that reads fields the
  // accumulated record still carries at runtime). `0 extends (1 & In)` is the
  // standard is-any probe.
  const mergeDecl = (
    fn: string,
    name: string,
    reads: string,
    adds: string,
    failOpen = false,
  ): string => {
    const merged = `Omit<In, keyof (${adds})> & ${adds}`;
    const ret = failOpen ? `0 extends (1 & In) ? any : (${merged})` : merged;
    return `declare function n_${fn}_${ident(name)}<In extends ${reads}>(m: In): ${ret};`;
  };
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
    if (def.source) continue; // source ports are pre-declared consts (pass 1)
    if (def.ports.length === 0) {
      // a sink still gets a callable so its incoming wires stay checked
      push(`declare function n_${fn}(m: ${def.reads}): void; // sink`);
    } else {
      for (const p of def.ports) {
        push(
          p.standalone
            ? `declare function n_${fn}_${ident(p.name)}(m: ${def.reads}): ${p.adds}; // output-independent port`
            : mergeDecl(fn, p.name, def.reads, p.adds),
        );
      }
    }
    // built-in lifecycle ports (merge onto the record, like data ports) — but
    // FAIL-OPEN past an unchecked (`any`) boundary: their handlers read carried
    // context, not a data contract (see mergeDecl).
    for (const name of builtinsByType.get(t) ?? []) {
      push(
        `${mergeDecl(fn, name, def.reads, builtinAdds(def, name), true)} // built-in ${name} port`,
      );
    }
  }
  push("");

  // (2) pass 1 — every WIRED port whose output is knowable without input
  for (const n of nodes) {
    (n.wires ?? []).forEach((targets, pi) => {
      if (!targets.length) return;
      const p = portAt(n, pi);
      if (defFor(n).source || p.standalone) {
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
      .flatMap(viaOf);

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
    const builtins = wiredBuiltinsOf(n);
    const inEdges = incoming.get(n.id)!.filter((e) => !e.back);
    const fanIn = inEdges.length > 1;
    const dataPorts = def.ports
      .map((_, i) => portAt(n, i))
      .filter((p) => !p.standalone);

    if (fanIn) {
      // FAN-IN join: Node-RED delivers each incoming message independently (it
      // never merges them), so on any firing the node's input is EXACTLY ONE
      // source's record — the type is the UNION of the sources. Routing that union
      // through the port FUNCTION (`n_x(fanIn(a,b))`) would type-check it against
      // `reads` on a SINGLE line: a mismatch there can't be pinned to one wire and
      // is redundant with the per-incoming checks below, so it would leak out as a
      // spurious unattributed diagnostic. Instead each output const is DECLARED
      // with its merge type computed directly off the input union (no reads-check
      // on this line — `Omit<union, keyof Adds> & Adds` keeps only the fields
      // COMMON to all sources, the sound downstream shape), and every incoming
      // wire is checked on its OWN line so a mismatch attributes to exactly it.
      const inRefs = inEdges.map(portRef);
      if (pinned.has(n.id)) inRefs.push(`pin_${ident(n.id)}`);
      const inUnion = inRefs.map((r) => `typeof ${r}`).join(" | ");
      const mergeType = (adds: string): string =>
        `Omit<${inUnion}, keyof (${adds})> & (${adds})`;
      for (const p of dataPorts) {
        push(
          `declare const m_${ident(id)}_${ident(p.name)}: ${mergeType(p.adds)}; // fan-in output`,
        );
      }
      for (const name of builtins) {
        push(
          `declare const m_${ident(id)}_${ident(name)}: ${mergeType(builtinAdds(def, name))}; // fan-in built-in ${name}`,
        );
      }
      // one independently-attributable compatibility check per incoming wire
      for (const e of inEdges) {
        push(
          `((x: ${def.reads}): void => void x)(${portRef(e)}); // fan-in wire`,
          viaOf(e),
        );
      }
    } else {
      const bodyWires = inWires(n);
      if (def.ports.length === 0 && builtins.length === 0) {
        if (IN) push(`n_${fn}(${IN});`, bodyWires);
      } else {
        // per-PORT emission — data ports plus wired built-in lifecycle ports. Every
        // port merges the node's input record (`Omit<In, keyof Adds> & Adds`).
        const fnOf = (name: string): string => `n_${fn}_${ident(name)}`;
        for (const p of dataPorts) {
          push(
            `const m_${ident(id)}_${ident(p.name)} = ${fnOf(p.name)}(${IN});`,
            bodyWires,
          );
        }
        for (const name of builtins) {
          push(
            `const m_${ident(id)}_${ident(name)} = ${fnOf(name)}(${IN});`,
            bodyWires,
          );
        }
      }
    }
  }
  for (const e of backEdges) {
    const v = byId.get(e.dst)!;
    // the back-edge wire must satisfy the join's loop invariant (its declared reads)
    deferred.push({
      text: `((x: ${defFor(v).reads}): void => void x)(${portRef(e)}); // back-edge: loop invariant`,
      wires: viaOf(e),
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
    paths,
    uncheckedTypes: [...unknownTypes],
    deadWires: [...deadWiresById.values()],
  };
}

export { compileFlow };
export type {
  Registry,
  RegistryEntry,
  RegistryPort,
  FlowNode,
  WireRef,
  WirePath,
  CompiledFlow,
};
