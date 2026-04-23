import type { Plugin } from "vite";

/**
 * Appends a CJS footer so Node-RED can load the package.
 *
 * esbuild CJS output for `export default value` can take two forms:
 *   (a) module.exports = value          (no __esModule flag)
 *   (b) exports.__esModule=true; exports.default = value
 * Both are normalised into `_exp` before branching:
 *
 *   - Declarative manifest { nodes }: calls registerTypes(nodes)
 *   - Callable function with .nodes:  attaches class properties
 *
 * Must be added to the server build in both dev and production modes.
 */
function cjsWrapper(): Plugin {
  return {
    name: "vite-plugin-node-red:server:cjs-wrapper",
    renderChunk(code, chunk, outputOptions) {
      if (!chunk.isEntry || outputOptions.format !== "cjs") return null;
      const footer =
        `(function(){` +
        `var _exp=module.exports&&module.exports.__esModule?module.exports.default:module.exports;` +
        `if(_exp&&typeof _exp==="object"&&Array.isArray(_exp.nodes)){` +
        `var _nrg=require("@bonsae/nrg/server");` +
        `module.exports=_nrg.registerTypes(_exp.nodes);` +
        `}` +
        `else if(typeof _exp==="function"&&Array.isArray(_exp.nodes)){` +
        `module.exports=_exp;` +
        `_exp.nodes.forEach(function(cls){` +
        `if(cls&&cls.type){` +
        `_exp[cls.type.replace(/(?:^|[-_])(\\w)/g,function(_,c){return c.toUpperCase();})] = cls;` +
        `}` +
        `});` +
        `}` +
        `})();`;
      return { code: `${code}\n${footer}`, map: null };
    },
  };
}

/**
 * Transforms the ESM bundle so its default export is the Node-RED package
 * function (result of registerTypes), not the raw { nodes: [...] } object.
 *
 * Also injects __dirname/__filename shims so user code that references them
 * works in ESM.
 *
 * The ESM bundle is loaded in two contexts:
 *   - At runtime: CJS bridge does `import("./index.mjs")` then `mod.default(RED)`
 *   - At build time: node-definitions-inliner does `import("./index.mjs")` then `mod.default.nodes`
 *
 * Both work because registerTypes() returns an async function with a `.nodes` property.
 *
 * Must be added to the server build in both dev and production modes.
 */
function esmWrapper(): Plugin {
  return {
    name: "vite-plugin-node-red:server:esm-wrapper",
    renderChunk(code, chunk, outputOptions) {
      if (!chunk.isEntry || outputOptions.format !== "es") return null;

      // Rollup ES output uses one of these forms:
      //   export { something as default };
      //   export default something;
      // Replace with a wrapper that pipes through registerTypes.
      const reNamed = /export\s*\{\s*(\w+)\s+as\s+default\s*\}\s*;?/;
      const reDefault = /export\s+default\s+(\w+)\s*;?/;

      let match = code.match(reNamed);
      let varName: string | undefined;
      let matchStr: string | undefined;

      if (match) {
        varName = match[1];
        matchStr = match[0];
      } else {
        match = code.match(reDefault);
        if (match) {
          varName = match[1];
          matchStr = match[0];
        }
      }

      if (!varName || !matchStr) return null;

      const header = [
        `import { fileURLToPath as __nrgFileURLToPath } from "url";`,
        `import { dirname as __nrgDirname } from "path";`,
        `var __filename = __nrgFileURLToPath(import.meta.url);`,
        `var __dirname = __nrgDirname(__filename);`,
        `import { registerTypes as __nrgRegisterTypes } from "@bonsae/nrg/server";`,
        ``,
      ].join("\n");
      const replacement = [
        `var __nrgExport = ${varName};`,
        `if (__nrgExport && typeof __nrgExport === "object" && Array.isArray(__nrgExport.nodes)) {`,
        `  __nrgExport = __nrgRegisterTypes(__nrgExport.nodes);`,
        `}`,
        `export { __nrgExport as default };`,
      ].join("\n");

      const newCode = header + code.replace(matchStr, replacement);
      return { code: newCode, map: null };
    },
  };
}

export { cjsWrapper, esmWrapper };
