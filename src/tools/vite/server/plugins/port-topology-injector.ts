import type { Plugin } from "vite";
import path from "node:path";
import type { PortTopology } from "./node-type-info";

/**
 * Stamp each node's `Input`/`Output`-generic topology onto its built class under
 * a locked `Symbol.for("nrg.ports")` static, so the runtime routes ports and the
 * editor draws them from the TYPES — schemas are data-validation only.
 * `io-node`'s `get outputs()`/`get inputs()`/named-port resolution read this
 * descriptor exclusively; a node whose generics are untyped is left untouched
 * (`portTopology` returns `undefined` for those, the map has no entry, and the
 * node is inert — there is no schema fallback).
 *
 * Runs `post`, after vite:esbuild strips TypeScript, so `this.parse` (acorn)
 * sees plain JS. With `keepNames` (the server build's esbuild setting) the
 * default-export class — `export default class X` or an anonymous class — is
 * normalized to a local binding plus `export { <local> as default }`; we append
 * `Object.defineProperty(<local>, Symbol.for("nrg.ports"), { value: {…}, … })`
 * after it (non-writable, so it can't be accidentally clobbered).
 * Two extra shapes are handled defensively in case a future esbuild keeps
 * `export default class X {}` or a bare `export default <expr>`.
 */
function portTopologyInjector(topology: Map<string, PortTopology>): Plugin {
  return {
    name: "vite-plugin-node-red:server:port-topology-injector",
    enforce: "post",

    transform(code, id) {
      if (topology.size === 0) return;
      const file = path.resolve(id.split("?")[0]);
      const ports = topology.get(file);
      if (!ports) return;

      let ast: { body: any[] };
      try {
        ast = this.parse(code) as { body: any[] };
      } catch {
        return;
      }

      const json = JSON.stringify(ports);
      // Symbol-keyed + locked: framework-owned, off the public string surface,
      // and non-writable so it can't be accidentally clobbered. `Symbol.for`
      // matches the runtime's `NRG_PORTS` across the bundle split.
      const appendStatic = (localName: string) => ({
        code: `${code}\nObject.defineProperty(${localName}, Symbol.for("nrg.ports"), { value: ${json}, writable: false, configurable: false });\n`,
        map: null,
      });

      for (const node of ast.body) {
        // `export default class X {}` (named class declaration)
        if (
          node.type === "ExportDefaultDeclaration" &&
          node.declaration?.type === "ClassDeclaration" &&
          node.declaration.id?.name
        ) {
          return appendStatic(node.declaration.id.name);
        }
        // `export { X as default }` (the esbuild-normalized shape)
        if (node.type === "ExportNamedDeclaration" && !node.source) {
          const local = node.specifiers?.find(
            (s: any) => s.exported?.name === "default",
          )?.local?.name;
          if (local) return appendStatic(local);
        }
      }

      // `export default <expr>` (not a declaration) — capture, stamp, re-export.
      for (const node of ast.body) {
        if (
          node.type === "ExportDefaultDeclaration" &&
          node.declaration &&
          node.declaration.type !== "ClassDeclaration" &&
          node.declaration.type !== "FunctionDeclaration"
        ) {
          const expr = code.slice(node.declaration.start, node.declaration.end);
          const replacement =
            `const __nrgDefault = ${expr};\n` +
            `Object.defineProperty(__nrgDefault, Symbol.for("nrg.ports"), { value: ${json}, writable: false, configurable: false });\n` +
            `export { __nrgDefault as default };`;
          return {
            code:
              code.slice(0, node.start) + replacement + code.slice(node.end),
            map: null,
          };
        }
      }

      return;
    },
  };
}

export { portTopologyInjector };
