import type { Plugin } from "vite";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import mime from "mime-types";

const VIRTUAL_ID = "virtual:nrg/node-definitions";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

const VIRTUAL_ENTRY_ID = "virtual:nrg/client-entry";
const RESOLVED_ENTRY_ID = "\0" + VIRTUAL_ENTRY_ID;

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
): Plugin {
  let _nodeTypes: string[] = [];

  return {
    name: "vite-plugin-node-red:client:node-definitions-inliner",
    enforce: "pre",

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID;
    },

    load(id) {
      if (id === RESOLVED_ENTRY_ID) return "";
      if (id !== RESOLVED_ID) return;

      const require = createRequire(import.meta.url);
      const serverEntryPath = path.resolve(serverOutDir, "index.js");

      delete require.cache[serverEntryPath];
      const rawMod = require(serverEntryPath);
      const packageFn = rawMod?.default ?? rawMod;
      const nodeClasses: any[] = packageFn?.nodes ?? [];

      const definitions: Record<string, any> = {};
      for (const NodeClass of nodeClasses) {
        const type = NodeClass.type;
        if (!type) continue;
        _nodeTypes.push(type);
        definitions[type] = {
          type,
          category: NodeClass.category,
          configSchema: NodeClass.configSchema ?? null,
          credentialsSchema: NodeClass.credentialsSchema ?? null,
          settingsSchema: NodeClass.settingsSchema ?? null,
          align: NodeClass.align,
          color: NodeClass.color,
          icon: iconsDir ? resolveIcon(iconsDir, type) : undefined,
          labelStyle: NodeClass.labelStyle,
          paletteLabel: NodeClass.paletteLabel,
          inputs: NodeClass.inputs,
          outputs: NodeClass.outputs,
          inputLabels: NodeClass.inputLabels,
          outputLabels: NodeClass.outputLabels,
          inputSchema: NodeClass.inputSchema ?? null,
          outputsSchema: NodeClass.outputsSchema ?? null,
        };
      }

      return `export default ${JSON.stringify(definitions)};`;
    },

    transform(code, id) {
      if (id !== entryPath && id !== RESOLVED_ENTRY_ID) return;

      const nrgImports = new Set<string>(["__setSchemas"]);
      const lines = [
        `import __nrgSchemas from "${VIRTUAL_ID}";`,
      ];
      const postLines: string[] = [
        `__setSchemas(__nrgSchemas);`,
      ];

      // Auto-detect form components by convention: {componentsDir}/{type}.vue
      const formTypes = new Set<string>();
      if (componentsDir && fs.existsSync(componentsDir)) {
        const formImports: string[] = [];
        const formEntries: string[] = [];

        for (const type of _nodeTypes) {
          const componentPath = path.resolve(componentsDir, `${type}.vue`);
          if (fs.existsSync(componentPath)) {
            formTypes.add(type);
            const varName = `__nrgForm_${type.replace(/-/g, "_")}`;
            formImports.push(`import ${varName} from ${JSON.stringify(componentPath)};`);
            formEntries.push(`${JSON.stringify(type)}: ${varName}`);
          }
        }

        if (formImports.length > 0) {
          lines.push(...formImports);
          nrgImports.add("__setForms");
          postLines.push(`__setForms({ ${formEntries.join(", ")} });`);
        }
      }

      // Auto-detect node definitions by convention: {nodesDir}/{type}.ts
      // For types without an explicit definition file, generate a minimal one.
      const defVarNames: string[] = [];
      for (const type of _nodeTypes) {
        const varName = `__nrgNodeDef_${type.replace(/-/g, "_")}`;
        const tsPath = nodesDir ? path.resolve(nodesDir, `${type}.ts`) : null;

        if (tsPath && fs.existsSync(tsPath)) {
          lines.push(`import ${varName} from ${JSON.stringify(tsPath)};`);
        } else {
          // Generate minimal definition — schema & form are resolved at runtime
          lines.push(`const ${varName} = { type: ${JSON.stringify(type)} };`);
        }
        defVarNames.push(varName);
      }

      if (defVarNames.length > 0) {
        nrgImports.add("registerTypes");
        postLines.push(`registerTypes([${defVarNames.join(", ")}]);`);
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
