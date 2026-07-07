import path from "path";
import {
  extractNodeTypesFromSrc,
  portTopology,
  type PortTopology,
} from "@/tools/vite/server/plugins/node-type-info";
import { NRG_PORTS } from "@/sdk/lib/server/nodes/symbols";

/**
 * Make a SOURCE node behave like a BUILT one in tests.
 *
 * A node's port topology (input/output port count + named-port names) comes from
 * its TypeScript generics. The production build stamps it onto the class under
 * `Symbol.for("nrg.ports")` via a vite plugin (see
 * tools/vite/server/plugins/port-topology-injector.ts) using the extractor in
 * node-type-info.ts. Un-built source carries no such static, and there is no
 * schema fallback (schemas are validation-only), so a types-only node would
 * report 0 ports in tests. The server test harnesses call
 * {@link ensurePortTopology} to run the SAME extraction and stamp the SAME static,
 * so `createNode` (unit) and `startRuntime` (integration) route ports — including
 * the built-in error/complete/status ports — exactly as the built node does.
 *
 * The client tiers need nothing here: component/unit tests feed the editor form
 * plain node objects with topology supplied explicitly, and e2e runs the real
 * built bundle (already stamped).
 */

/**
 * Extracted topology per node `type`, memoized by resolved source dir. The
 * extraction (a `ts.Program`) is the expensive part, so it runs at most once per
 * dir per test process.
 */
const topologyByDir = new Map<string, Record<string, PortTopology>>();

/**
 * The server source dir to extract node types from — the same tree the build
 * reads. Defaults to the `src/server` convention; override with `NRG_SERVER_SRC`
 * (used by nrg's own harness self-tests to point at a fixture tree).
 */
function resolveSrcDir(srcDir?: string): string {
  return path.resolve(
    srcDir ??
      process.env.NRG_SERVER_SRC ??
      path.join(process.cwd(), "src/server"),
  );
}

function getPortTopologyMap(srcDir?: string): Record<string, PortTopology> {
  const dir = resolveSrcDir(srcDir);
  const cached = topologyByDir.get(dir);
  if (cached) return cached;

  const map: Record<string, PortTopology> = {};
  try {
    for (const info of extractNodeTypesFromSrc(dir)) {
      const topo = portTopology(info);
      if (topo) map[info.type] = topo;
    }
  } catch (err) {
    // Best-effort: a node whose topology can't be type-derived just reports 0
    // ports (there is no schema fallback), so a single node never fails a test
    // here. But a genuine throw (an fs error, or an extractor bug on some exotic
    // type) zeroes topology for EVERY node in this dir — surface it so that shows
    // up as a traceable warning, not a silent wall of confusing zero-port failures.
    console.warn(
      `[nrg] port-topology extraction failed for ${dir}; types-only nodes will report 0 ports:`,
      err,
    );
  }
  topologyByDir.set(dir, map);
  return map;
}

/**
 * Stamp one source node class with its build-time `__nrgPorts` topology, unless
 * it already carries it (a built node, or a prior stamp) or its topology can't
 * be type-derived (an untyped node — it stays at 0 ports; there is no schema
 * fallback). Idempotent and safe on ConfigNode/Node (which have no ports).
 */
function ensurePortTopology(
  NodeClass: { type?: string },
  srcDir?: string,
): void {
  if (Object.getOwnPropertyDescriptor(NodeClass, NRG_PORTS)) return;
  const type = NodeClass.type;
  if (!type) return;
  const topo = getPortTopologyMap(srcDir)[type];
  if (!topo) return;
  // Mirrors the build injector, but `configurable` so repeated createNode calls
  // on the same class (and re-stamps across a watch run) don't throw.
  Object.defineProperty(NodeClass, NRG_PORTS, {
    value: topo,
    writable: false,
    configurable: true,
  });
}

/** {@link ensurePortTopology} over a set of classes (the integration harness). */
function ensurePortTopologyAll(
  nodeClasses: ReadonlyArray<{ type?: string }>,
  srcDir?: string,
): void {
  for (const NodeClass of nodeClasses) ensurePortTopology(NodeClass, srcDir);
}

export { ensurePortTopology, ensurePortTopologyAll, getPortTopologyMap };
