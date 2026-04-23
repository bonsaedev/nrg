import type { Plugin } from "vite";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import mime from "mime-types";

const VIRTUAL_ID = "virtual:nrg/node-definitions";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

const VIRTUAL_ENTRY_ID = "virtual:nrg/client-entry";
const RESOLVED_ENTRY_ID = "\0" + VIRTUAL_ENTRY_ID;

const SKIP_DEFAULTS = new Set(["x", "y", "z", "g", "wires", "type", "id"]);

function getDefaultsFromSchema(
  schema: any,
):
  | Record<string, { type?: string; required: boolean; value: any }>
  | undefined {
  if (!schema?.properties) return undefined;
  const result: Record<
    string,
    { type?: string; required: boolean; value: any }
  > = {};
  for (const [key, prop] of Object.entries(schema.properties) as [
    string,
    any,
  ][]) {
    if (SKIP_DEFAULTS.has(key)) continue;
    result[key] = {
      required: false,
      value: prop.default ?? undefined,
      type: prop["node-type"],
    };
  }
  return result;
}

function getCredentialsFromSchema(
  schema: any,
): Record<string, { type: string; required: boolean; value: any }> | undefined {
  if (!schema?.properties) return undefined;
  const result: Record<
    string,
    { type: string; required: boolean; value: any }
  > = {};
  for (const [key, prop] of Object.entries(schema.properties) as [
    string,
    any,
  ][]) {
    result[key] = {
      required: false,
      type: prop.format === "password" ? "password" : "text",
      value: prop.default ?? undefined,
    };
  }
  return result;
}

function resolveIcon(iconsDir: string, type: string): string | undefined {
  if (!fs.existsSync(iconsDir)) return undefined;
  return fs.readdirSync(iconsDir).find((f) => {
    if (path.basename(f, path.extname(f)) !== type) return false;
    const mimeType = mime.lookup(f);
    return mimeType !== false && mimeType.startsWith("image/");
  });
}

function nodeDefinitionsInliner(
  serverOutDir: string,
  entryPath: string,
  iconsDir?: string,
  componentsDir?: string,
  nodesDir?: string,
  hasUserEntry: boolean = true,
): Plugin {
  let _nodeTypes: string[] = [];
  let _definitions: Record<string, any> = {};

  return {
    name: "vite-plugin-node-red:client:node-definitions-inliner",
    enforce: "pre",

    // Load the server bundle in buildStart so _nodeTypes is populated
    // before any load/transform hooks run.
    async buildStart() {
      _nodeTypes = [];
      _definitions = {};

      const esmEntryPath = path.resolve(serverOutDir, "index.mjs");
      const cjsEntryPath = path.resolve(serverOutDir, "index.js");

      let packageFn: any;
      if (fs.existsSync(esmEntryPath)) {
        const fileUrl = pathToFileURL(esmEntryPath).href + `?t=${Date.now()}`;
        const mod = await import(fileUrl);
        packageFn = mod?.default ?? mod;
      } else if (fs.existsSync(cjsEntryPath)) {
        const require = createRequire(import.meta.url);
        delete require.cache[cjsEntryPath];
        const rawMod = require(cjsEntryPath);
        packageFn = rawMod?.default ?? rawMod;
      }

      const nodeClasses: any[] = packageFn?.nodes ?? [];

      for (const NodeClass of nodeClasses) {
        const type = NodeClass.type;
        if (!type) continue;
        _nodeTypes.push(type);
        const configSchema = NodeClass.configSchema ?? null;
        const credentialsSchema = NodeClass.credentialsSchema ?? null;
        const inputSchema = NodeClass.inputSchema ?? null;
        const outputsSchema = NodeClass.outputsSchema ?? null;

        // Pre-compute defaults and credentials at build time
        const defaults = getDefaultsFromSchema(configSchema);
        if (defaults && inputSchema) {
          defaults.validateInput = { required: false, value: false };
        }
        if (defaults && outputsSchema) {
          defaults.validateOutput = { required: false, value: false };
        }
        const credentials = getCredentialsFromSchema(credentialsSchema);

        _definitions[type] = {
          type,
          category: NodeClass.category,
          configSchema,
          credentialsSchema,
          settingsSchema: NodeClass.settingsSchema ?? null,
          defaults: defaults ?? undefined,
          credentials: credentials ?? undefined,
          align: NodeClass.align,
          color: NodeClass.color,
          icon: iconsDir ? resolveIcon(iconsDir, type) : undefined,
          labelStyle: NodeClass.labelStyle,
          paletteLabel: NodeClass.paletteLabel,
          inputs: NodeClass.inputs,
          outputs: NodeClass.outputs,
          inputLabels: NodeClass.inputLabels,
          outputLabels: NodeClass.outputLabels,
          inputSchema,
          outputsSchema,
        };
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID;
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID) return "";
      if (id !== RESOLVED_ID) return;
      return `export default ${JSON.stringify(_definitions)};`;
    },

    transform(code, id) {
      if (id !== entryPath && id !== RESOLVED_ENTRY_ID) return;

      const nrgImports = new Set<string>(["__setSchemas"]);
      const lines = [`import __nrgSchemas from "${VIRTUAL_ID}";`];
      const postLines: string[] = [`__setSchemas(__nrgSchemas);`];

      // Auto-detect form components by convention: {componentsDir}/{type}.vue
      if (componentsDir && fs.existsSync(componentsDir)) {
        const formImports: string[] = [];
        const formEntries: string[] = [];

        for (const type of _nodeTypes) {
          const componentPath = path.resolve(componentsDir, `${type}.vue`);
          if (fs.existsSync(componentPath)) {
            const varName = `__nrgForm_${type.replace(/-/g, "_")}`;
            formImports.push(
              `import ${varName} from ${JSON.stringify(componentPath)};`,
            );
            formEntries.push(`${JSON.stringify(type)}: ${varName}`);
          }
        }

        if (formImports.length > 0) {
          lines.push(...formImports);
          nrgImports.add("__setForms");
          postLines.push(`__setForms({ ${formEntries.join(", ")} });`);
        }
      }

      // Auto-register only when no user entry was provided.
      // When the user provides client/index.ts, they control registration.
      if (!hasUserEntry) {
        const defVarNames: string[] = [];
        for (const type of _nodeTypes) {
          const varName = `__nrgNodeDef_${type.replace(/-/g, "_")}`;
          const tsPath = nodesDir ? path.resolve(nodesDir, `${type}.ts`) : null;

          if (tsPath && fs.existsSync(tsPath)) {
            lines.push(`import ${varName} from ${JSON.stringify(tsPath)};`);
          } else {
            lines.push(`const ${varName} = { type: ${JSON.stringify(type)} };`);
          }
          defVarNames.push(varName);
        }

        if (defVarNames.length > 0) {
          nrgImports.add("registerTypes");
          postLines.push(`registerTypes([${defVarNames.join(", ")}]);`);
        }
      }

      // Build the @bonsae/nrg/client import line
      const importLine = `import { ${[...nrgImports].join(", ")} } from "@bonsae/nrg/client";`;
      lines.splice(1, 0, importLine);

      lines.push(...postLines);
      lines.push("");
      return { code: lines.join("\n") + code, map: null };
    },
  };
}

export { nodeDefinitionsInliner };
