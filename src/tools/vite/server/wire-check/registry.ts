import path from "node:path";
import { extractNodeTypesFromSrc } from "../plugins/node-type-info";
import type { Registry } from "./compile";

interface BuiltRegistry {
  registry: Registry;
  /** Declarations for named local types the extracted port types reference
   * (recursive types, enums) — prepended to every compiled program. */
  declarations: string;
  /** The extracted nrg node types, for reporting. */
  types: string[];
}

/**
 * Build the wire-check registry from a package's server source with the SAME
 * extractor the production build uses — the node classes' `Port<T,C>` generics
 * ARE the contract:
 *  - input port `T`  → the node's READS (`In extends Reads`),
 *  - output port `T` → that port's ADDS (`In & Adds`),
 *  - `input()`'s return type → the builtin complete port's contribution,
 *  - no input port → a source node (outputs knowable without an input).
 * The message model is always merge — a port's output is `In & Adds`.
 */
function buildRegistry(srcDir: string): BuiltRegistry {
  type Role = { text: string; resolved?: string } | undefined;
  const roleText = (r: Role): string | undefined => r?.resolved ?? r?.text;

  const localTypes: Record<string, string> = {};
  const infos = [
    ...extractNodeTypesFromSrc(path.resolve(srcDir), undefined, localTypes),
  ];
  // An output port typed `Port<any>`/`Port<unknown>` is an UNTYPED port (the
  // author declared no shape) — an unchecked boundary, not a strict `unknown`
  // that would falsely red every typed downstream. Normalize both to `any` so
  // they absorb like a core node. (The complete-port void fallback keeps its own
  // deliberate `unknown` in compile.ts — that means "forward the record", not
  // "untyped output".)
  const addsOf = (role: Role): string => {
    const t = roleText(role);
    return t === undefined || t === "unknown" ? "any" : t;
  };
  const registry: Registry = {};
  for (const info of infos) {
    if (info.kind !== "io") continue;
    const reads = roleText(info.input);
    registry[info.type] = {
      source: reads === undefined,
      reads: reads ?? "object",
      ports: (info.outputs ?? []).map(
        (p: { name?: string; role?: Role }, i: number) => ({
          name: p.name ?? `out${i}`,
          adds: addsOf(p.role),
        }),
      ),
      complete: roleText(info.complete),
    };
  }
  const declarations = Object.keys(localTypes)
    .sort()
    .map((name) => localTypes[name])
    .join("\n");
  return { registry, declarations, types: Object.keys(registry) };
}

export { buildRegistry };
export type { BuiltRegistry };
