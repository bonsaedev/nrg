import type { Plugin } from "vite";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import { nodeDefsPath } from "../../utils";
import { logger } from "../../logger";

// Per-node schema files. Each `defineNode({ type })` call is wrapped at build
// time as `{ ...schema, [form,] ...defineNode({...}) }`, importing ONLY its own
// `schemas/<type>.json` from the cache — so a node module never references
// another type's schema, and there is no runtime schema/form registry (the old
// `__setSchemas`/`__setForms` global bridge is gone). Real files (not virtual
// modules) so they browse cleanly as `schemas/<type>.ts` in dev devtools;
// Rollup inlines them into the bundle in prod.

function resolveIcon(iconsDir: string, type: string): string | undefined {
  if (!fs.existsSync(iconsDir)) return undefined;
  return fs.readdirSync(iconsDir).find((f) => {
    if (path.basename(f, path.extname(f)) !== type) return false;
    const mimeType = mime.lookup(f);
    return mimeType !== false && mimeType.startsWith("image/");
  });
}

// Minimal recursive walker over the acorn/ESTree AST from `this.parse`. No dep:
// estree-walker is transitive-only, and the AST has no cycles (no parent links).
function walkAst(node: any, visit: (n: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end") continue;
    const value = node[key];
    if (value && typeof value === "object") walkAst(value, visit);
  }
}

/**
 * If `node` is a `defineNode({ type: "<literal>", … })` call, return its literal
 * type. Returns `{ type: null }` when it IS a defineNode call but the `type` is
 * missing/computed (so the caller can warn), and `undefined` when it is not a
 * defineNode call at all.
 */
function definedNodeType(node: any): { type: string | null } | undefined {
  if (node.type !== "CallExpression") return undefined;
  if (node.callee?.type !== "Identifier" || node.callee.name !== "defineNode") {
    return undefined;
  }
  const arg = node.arguments?.[0];
  if (!arg || arg.type !== "ObjectExpression") return { type: null };
  const prop = arg.properties.find(
    (p: any) =>
      p.type === "Property" &&
      !p.computed &&
      ((p.key.type === "Identifier" && p.key.name === "type") ||
        (p.key.type === "Literal" && p.key.value === "type")),
  );
  if (
    prop &&
    prop.value.type === "Literal" &&
    typeof prop.value.value === "string"
  ) {
    return { type: prop.value.value };
  }
  return { type: null };
}

const varSafe = (type: string) => type.replace(/[^A-Za-z0-9_$]/g, "_");

function nodeDefinitionsInliner(
  serverOutDir: string,
  entryPath: string,
  iconsDir?: string,
  componentsDir?: string,
  nodesDir?: string,
  hasUserEntry: boolean = true,
  // Cache directory for generated files (inside node_modules, gitignored).
  // Provided by the caller so it stays consistent with the generated entry path
  // and is isolated per output dir. Defaults to the shared location for any
  // standalone use.
  cacheDir: string = path.resolve("node_modules", ".nrg", "client"),
): Plugin[] {
  let _nodeTypes: string[] = [];
  let _definitions: Record<string, any> = {};

  // One serialized schema file per node type, under the cache. The wrap
  // transform imports these by absolute path. `.ts` with `export default { … }`
  // (not `.json`): esbuild unquotes the object's identifier keys when it inlines
  // them, matching how the schema shipped before; a `.json` import becomes
  // `JSON.parse("{…}")`, keeping keys quoted inside a string.
  const schemasDir = path.resolve(cacheDir, "schemas");
  const schemaFile = (type: string) => path.resolve(schemasDir, `${type}.ts`);

  // Convention form for a node type: `{componentsDir}/{type}.vue`, or undefined.
  function conventionForm(type: string): string | undefined {
    if (!componentsDir) return undefined;
    const p = path.resolve(componentsDir, `${type}.vue`);
    return fs.existsSync(p) ? p : undefined;
  }

  // Auto-entry codegen (only when the project has NO physical client entry):
  // import each node's wrapped default export and register them. Schema + form
  // ride on each def via the wrap transform, so the entry only registers.
  function generateEntryCode(): string {
    const lines: string[] = [];
    const defVarNames: string[] = [];
    for (const type of _nodeTypes) {
      const varName = `__nrgNodeDef_${varSafe(type)}`;
      const userTsPath = nodesDir ? path.resolve(nodesDir, `${type}.ts`) : null;
      const tsPath =
        userTsPath && fs.existsSync(userTsPath)
          ? userTsPath
          : path.resolve(cacheDir, "nodes", `${type}.ts`);
      lines.push(`import ${varName} from ${JSON.stringify(tsPath)};`);
      defVarNames.push(varName);
    }
    lines.push(`import { registerTypes } from "@bonsae/nrg/client";`);
    if (defVarNames.length) {
      lines.push(`registerTypes([${defVarNames.join(", ")}]);`);
    }
    lines.push("");
    return lines.join("\n");
  }

  const setup: Plugin = {
    name: "vite-plugin-node-red:client:node-definitions-inliner",
    enforce: "pre",

    // Read the node definitions the server build extracted (from executing the
    // just-built bundle) and add the icon — the only field resolved client-side,
    // from the resources dir. Populated before any load/transform hook runs.
    buildStart() {
      _nodeTypes = [];
      _definitions = {};

      const defsFile = nodeDefsPath(serverOutDir);
      const { nodeTypes, definitions } = fs.existsSync(defsFile)
        ? (JSON.parse(fs.readFileSync(defsFile, "utf-8")) as {
            nodeTypes: string[];
            definitions: Record<string, any>;
          })
        : { nodeTypes: [], definitions: {} };

      _nodeTypes = nodeTypes;
      for (const type of _nodeTypes) {
        _definitions[type] = {
          ...definitions[type],
          icon: iconsDir ? resolveIcon(iconsDir, type) : undefined,
        };
      }

      // Always (re)write one serialized schema file per type, pretty-printed so
      // it is legible in dev devtools. The wrap transform imports these; Rollup
      // inlines them in prod. Independent of the entry mode below — user-authored
      // node files import their schema the same way the generated stubs do.
      if (fs.existsSync(schemasDir)) {
        fs.rmSync(schemasDir, { recursive: true });
      }
      fs.mkdirSync(schemasDir, { recursive: true });
      for (const type of _nodeTypes) {
        fs.writeFileSync(
          schemaFile(type),
          `// auto-generated by nrg — serialized schema for "${type}"\n` +
            `export default ${JSON.stringify(_definitions[type] ?? {}, null, 2)};\n`,
        );
      }

      // When no user entry, generate node definition files in cache
      // so they appear as separate files in browser devtools.
      if (!hasUserEntry) {
        const nodesCache = path.resolve(cacheDir, "nodes");
        if (fs.existsSync(nodesCache)) {
          fs.rmSync(nodesCache, { recursive: true });
        }
        fs.mkdirSync(nodesCache, { recursive: true });

        for (const type of _nodeTypes) {
          // Skip if user has a physical node definition file
          const userTsPath = nodesDir
            ? path.resolve(nodesDir, `${type}.ts`)
            : null;
          if (userTsPath && fs.existsSync(userTsPath)) continue;

          const content = [
            `// auto-generated by nrg`,
            `import { defineNode } from "@bonsae/nrg/client";`,
            ``,
            `export default defineNode({`,
            `  type: ${JSON.stringify(type)},`,
            `});`,
            ``,
          ].join("\n");
          fs.writeFileSync(path.resolve(nodesCache, `${type}.ts`), content);
        }

        // Also write the entry file to cache
        const entryContent = generateEntryCode();
        fs.mkdirSync(path.dirname(path.resolve(cacheDir, "index.ts")), {
          recursive: true,
        });
        fs.writeFileSync(path.resolve(cacheDir, "index.ts"), entryContent);
      }
    },

    load(id) {
      // For auto-generated entries, return the generated code directly
      // so the browser devtools shows the actual source instead of the
      // placeholder comment on disk.
      if (!hasUserEntry && id === entryPath) {
        return generateEntryCode();
      }
    },
  };

  const wrap: Plugin = {
    name: "vite-plugin-node-red:client:node-schema-wrap",
    // `post` so this runs AFTER vite:esbuild strips TypeScript — `this.parse`
    // (acorn) can only parse plain JS. The client is always built via Rollup
    // (`viteBuild`), never a dev server, so injecting imports this late is safe:
    // Rollup re-scans the transformed code for imports and resolves each
    // `virtual:nrg/schema/<type>` via the `setup` plugin's resolveId.
    enforce: "post",

    transform(code, id) {
      const clean = id.split("?")[0];
      if (id.startsWith("\0")) return;
      // Client source lives outside node_modules; the only exception is the
      // generated stub node files under cacheDir (which IS inside node_modules).
      if (!clean.startsWith(cacheDir) && clean.includes("/node_modules/")) {
        return;
      }
      if (!/\.(ts|mts|cts|js|mjs|cjs)$/.test(clean)) return;
      if (!code.includes("defineNode")) return;

      let ast: any;
      try {
        ast = this.parse(code);
      } catch {
        return;
      }

      const calls: { start: number; end: number; type: string | null }[] = [];
      walkAst(ast, (node) => {
        const info = definedNodeType(node);
        if (info) calls.push({ start: node.start, end: node.end, ...info });
      });
      if (!calls.length) return;

      const rel = path.relative(process.cwd(), clean);
      const importLines: string[] = [];
      const seen = new Set<string>();
      let out = code;

      // Splice from the end so earlier offsets stay valid.
      for (const call of [...calls].sort((a, b) => b.start - a.start)) {
        if (call.type == null) {
          logger.warn(
            `${rel}: defineNode() with a non-literal \`type\` — schema/form not injected`,
          );
          continue;
        }
        if (!_nodeTypes.includes(call.type)) {
          logger.warn(
            `${rel}: node type "${call.type}" has no server-extracted schema — registering without defaults/validation`,
          );
          continue;
        }

        const safe = varSafe(call.type);
        const schemaVar = `__nrgSchema_${safe}`;
        const formVar = `__nrgForm_${safe}`;
        const formPath = conventionForm(call.type);
        if (!seen.has(call.type)) {
          seen.add(call.type);
          importLines.push(
            `import ${schemaVar} from ${JSON.stringify(schemaFile(call.type))};`,
          );
          if (formPath) {
            importLines.push(
              `import ${formVar} from ${JSON.stringify(formPath)};`,
            );
          }
        }

        const orig = out.slice(call.start, call.end);
        const formSpread = formPath ? `form: { component: ${formVar} }, ` : "";
        out =
          out.slice(0, call.start) +
          `{ ...${schemaVar}, ${formSpread}...${orig} }` +
          out.slice(call.end);
      }

      if (!importLines.length) return;
      return { code: importLines.join("\n") + "\n" + out, map: null };
    },
  };

  return [setup, wrap];
}

export { nodeDefinitionsInliner };
