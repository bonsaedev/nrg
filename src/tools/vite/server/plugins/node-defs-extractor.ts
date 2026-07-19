import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { nodeDefsPath } from "../../utils";
import {
  getDefaultsFromSchema,
  getCredentialsFromSchema,
} from "../../../../sdk/lib/shared/schemas/utils";
import { mergeConfigDefaults } from "../../../../sdk/lib/server/schemas/config-defaults";

/**
 * Loads the freshly built server bundle and returns its default export (the
 * package function with a `.nodes` array), so node-class statics can be read.
 *
 * This runs during the SERVER build, BEFORE the runtime rename — so the bundle
 * still imports `@bonsae/nrg/{server,schema}` (the toolkit, installed at build
 * time) and loads directly, with no re-bundle or alias. The client inliner then
 * consumes the extracted JSON instead of loading the bundle itself.
 */
async function loadServerPackageExport(outDir: string): Promise<any> {
  const esmEntryPath = path.resolve(outDir, "index.mjs");
  const cjsEntryPath = path.resolve(outDir, "index.js");
  const isEsm = fs.existsSync(esmEntryPath);
  const entryPath = isEsm
    ? esmEntryPath
    : fs.existsSync(cjsEntryPath)
      ? cjsEntryPath
      : undefined;
  if (!entryPath) return undefined;

  if (isEsm) {
    // `?t=` busts the ESM cache so a watch rebuild re-reads the new bundle.
    const fileUrl = pathToFileURL(entryPath).href + `?t=${Date.now()}`;
    const mod = await import(fileUrl);
    return mod?.default ?? mod;
  }
  const require = createRequire(import.meta.url);
  delete require.cache[entryPath];
  const rawMod = require(entryPath);
  return rawMod?.default ?? rawMod;
}

interface NodeDefinitionsFile {
  nodeTypes: string[];
  /** Per-type definition, minus the icon (resolved client-side from iconsDir). */
  definitions: Record<string, any>;
}

/**
 * Load the built server bundle, read each node class's statics (schemas,
 * defaults, ports, colors, …) and write them to the hand-off JSON the client
 * build's node-definitions inliner reads. Everything here needs the server
 * bundle EXECUTED, which is why it lives in the server build (with toolkit
 * imports still resolvable) rather than in the client-side inliner. The icon is
 * intentionally omitted — it's a client concern resolved from the resources dir.
 */
async function extractNodeDefinitions(outDir: string): Promise<void> {
  const packageFn = await loadServerPackageExport(outDir);
  const nodeClasses: any[] = packageFn?.nodes ?? [];

  const nodeTypes: string[] = [];
  const definitions: Record<string, any> = {};

  for (const NodeClass of nodeClasses) {
    const type = NodeClass.type;
    if (!type) continue;
    nodeTypes.push(type);

    // Every IONode carries the built-in IONode config (name + lifecycle port
    // toggles + per-port data validation) whether or not it declares those
    // fields — so the editor's Ports Settings
    // section renders on all of them, and declaring a field only overrides its
    // default. Config nodes have no ports, so they're left as-is (detected by the
    // absence of the IONode `outputs` getter, which config nodes don't define).
    const isIONode = typeof NodeClass.outputs === "number";
    const configSchema = isIONode
      ? mergeConfigDefaults(NodeClass.configSchema, `nrg:${type}:config`)
      : (NodeClass.configSchema ?? null);
    const credentialsSchema = NodeClass.credentialsSchema ?? null;

    // Data-validation config (`inputSchema`/`outputSchemas`/`validateInput`/
    // `validateOutputs`) is merged into the config schema for every IONode, so
    // its defaults come straight from `getDefaultsFromSchema` — no
    // special injection here. Only the design-time wire type-check flags are
    // added, gated on the node actually having a typed input / typed outputs.
    const defaults = getDefaultsFromSchema(configSchema);
    if (defaults && NodeClass.inputs > 0) {
      defaults.validateInputTypes = { required: false, value: false };
    }
    if (defaults && NodeClass.outputs > 0) {
      defaults.validateOutputTypes = { required: false, value: {} };
    }
    const credentials = getCredentialsFromSchema(credentialsSchema);

    definitions[type] = {
      type,
      category: NodeClass.category,
      configSchema,
      credentialsSchema,
      settingsSchema: NodeClass.settingsSchema ?? null,
      defaults: defaults ?? undefined,
      credentials: credentials ?? undefined,
      align: NodeClass.align,
      color: NodeClass.color,
      inputs: NodeClass.inputs,
      outputs: NodeClass.outputs,
      // Resolved server-side (TypeBox Kind intact) so the editor labels named
      // output ports without guessing from the serialized schema.
      outputPortNames: NodeClass.outputPortNames ?? undefined,
    };
  }

  const payload: NodeDefinitionsFile = { nodeTypes, definitions };
  const outPath = nodeDefsPath(outDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload));
}

export { extractNodeDefinitions };
export type { NodeDefinitionsFile };
