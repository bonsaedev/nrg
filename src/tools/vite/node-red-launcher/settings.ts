import { builtinModules, createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import type { PluginBuild } from "esbuild";
import type { Logger } from "../logger";
import type { GenerateRuntimeSettingsOptions, RuntimeSettings } from "./types";

/**
 * The wire type-check plugin dir to auto-load into Node-RED's `nodesDir` so
 * `nrg dev` gives the author flow type-checking with no manual settings.
 * Preference order:
 *  1. a separately-installed `@bonsae/node-red-type-check-plugin` (a consumer
 *     that opted into a standalone/pinned plugin), else
 *  2. the plugin nrg SHIPS in its own dist (`type-check-plugin/` beside the
 *     package manifest) — present in every current nrg install, so the dev
 *     wire check is on by default.
 * Returns null only when neither resolves, and the feature simply stays off.
 */
function resolveTypeCheckPluginDir(): string | null {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  try {
    const manifest = req.resolve(
      "@bonsae/node-red-type-check-plugin/package.json",
    );
    return path.dirname(manifest).split(path.sep).join("/");
  } catch {
    // fall through to the nrg-shipped plugin
  }
  try {
    const nrgManifest = req.resolve("@bonsae/nrg/package.json");
    const shipped = path.join(path.dirname(nrgManifest), "type-check-plugin");
    if (fs.existsSync(path.join(shipped, "package.json"))) {
      return shipped.split(path.sep).join("/");
    }
  } catch {
    // nrg itself not resolvable (tests, exotic layouts) — feature off
  }
  return null;
}

function findUserRuntimeSettingsFilepath(
  settingsFilepath: string | undefined,
  logger: Logger,
): string | null {
  if (settingsFilepath) {
    const resolved = path.resolve(settingsFilepath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    logger.warn(`Settings file not found: ${settingsFilepath}`);
    return null;
  }

  const resolved = path.resolve("node-red.settings.ts");
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

/**
 * Resolve `@bonsae/nrg/vite`'s standalone settings-helper leaf, next to the
 * plugin entry in the consumer's installed nrg. A `node-red.settings.ts` imports
 * `defineNodeRedSettings` from `@bonsae/nrg/vite`, but we bundle that file
 * into Node-RED's runtime settings below — resolving the full plugin entry would
 * drag the dev toolchain's native deps (chokidar→fsevents, vite→lightningcss)
 * into the settings bundle and break the launch. `defineNodeRedSettings`
 * is a compile-time-only identity helper, so we redirect the import to this
 * dependency-free leaf. Returns null for an nrg that predates the leaf, so
 * bundling falls back to the plugin entry (older layouts don't hit the problem).
 */
function resolveSettingsHelperLeaf(): string | null {
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const viteEntry = req.resolve("@bonsae/nrg/vite");
    const leaf = path.join(path.dirname(viteEntry), "node-red-settings.js");
    return fs.existsSync(leaf) ? leaf : null;
  } catch {
    return null;
  }
}

async function compileRuntimeSettingsFile(
  runtimeSettingsFilepath: string,
  port: number,
): Promise<string> {
  // keyed by pid AND port so two launchers in the same process
  // (e.g. parallel e2e environments) can't overwrite each other
  const compiledRuntimeSettingsFilepath = path.join(
    os.tmpdir(),
    `node-red.settings.${process.pid}-${port}.cjs`,
  );

  // NOTE: I need to include "node:" modules which are a new common standard
  const nodeBuiltins = [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ];

  const settingsDir = path
    .dirname(runtimeSettingsFilepath)
    .split(path.sep)
    .join("/");
  const settingsFile = runtimeSettingsFilepath.split(path.sep).join("/");

  // Redirect `@bonsae/nrg/vite` to its dependency-free settings-helper leaf so
  // bundling the settings file never reaches the dev plugin's native deps.
  const helperLeaf = resolveSettingsHelperLeaf();
  const nrgViteHelperPlugin = {
    name: "nrg-vite-settings-helper",
    setup(build: PluginBuild) {
      build.onResolve({ filter: /^@bonsae\/nrg\/vite$/ }, () => ({
        path: helperLeaf as string,
      }));
    },
  };

  // NOTE: im hardcoding node18 because it doesn't really matter
  await esbuild({
    entryPoints: [runtimeSettingsFilepath],
    outfile: compiledRuntimeSettingsFilepath,
    format: "cjs",
    platform: "node",
    target: "node18",
    bundle: true,
    define: {
      "import.meta.dirname": JSON.stringify(settingsDir),
      "import.meta.filename": JSON.stringify(settingsFile),
      "import.meta.url": JSON.stringify(pathToFileURL(settingsFile).href),
    },
    external: [...nodeBuiltins, "node-red", "@node-red/*"],
    plugins: helperLeaf ? [nrgViteHelperPlugin] : [],
  });

  return compiledRuntimeSettingsFilepath;
}

async function generateRuntimeSettings(
  options: GenerateRuntimeSettingsOptions,
): Promise<RuntimeSettings> {
  const { outDir, port, settingsFilepath, logger } = options;
  const tempFiles: string[] = [];

  const userRuntimeSettingsFilepath = findUserRuntimeSettingsFilepath(
    settingsFilepath,
    logger,
  );
  let compiledRuntimeSettingsFilepath: string | null = null;
  if (userRuntimeSettingsFilepath) {
    compiledRuntimeSettingsFilepath = await compileRuntimeSettingsFile(
      userRuntimeSettingsFilepath,
      port,
    );
    tempFiles.push(compiledRuntimeSettingsFilepath);
  }

  const normalizedOutDir = path.resolve(outDir).split(path.sep).join("/");
  const cwd = process.cwd().split(path.sep).join("/");
  const userDir = path.resolve(cwd, ".node-red").split(path.sep).join("/");

  // JSON.stringify escapes quotes/backslashes so paths with special
  // characters can't break the generated JavaScript
  const userDirLiteral = JSON.stringify(userDir);
  const outDirLiteral = JSON.stringify(normalizedOutDir);
  const pluginDir = resolveTypeCheckPluginDir();
  const pluginDirLiteral = pluginDir ? JSON.stringify(pluginDir) : null;

  const finalRuntimeSettingsFile = compiledRuntimeSettingsFilepath
    ? `
const compiledRuntimeSettings = require(${JSON.stringify(
        compiledRuntimeSettingsFilepath.split(path.sep).join("/"),
      )});
const settings = compiledRuntimeSettings.default || compiledRuntimeSettings;
settings.uiPort = ${port};
if(!settings.userDir){
    settings.userDir = ${userDirLiteral};
}
settings.nodesDir = settings.nodesDir || [];
if (!settings.nodesDir.includes(${outDirLiteral})) {
  settings.nodesDir.push(${outDirLiteral});
}
${
  pluginDirLiteral
    ? `if (!settings.nodesDir.includes(${pluginDirLiteral})) {
  settings.nodesDir.push(${pluginDirLiteral});
}`
    : ""
}
if(!settings.flowFile){
  settings.flowFile = "flows.json";
}
// the welcome tour overlay intercepts pointer events — fatal for e2e and
// noise for dev; explicit user settings still win
settings.editorTheme = settings.editorTheme || {};
if (settings.editorTheme.tours === undefined) {
  settings.editorTheme.tours = false;
}
module.exports = settings;
`
    : `
const settings = {
  uiPort: ${port},
  userDir: ${userDirLiteral},
  flowFile: "flows.json",
  nodesDir: [${outDirLiteral}${pluginDirLiteral ? `, ${pluginDirLiteral}` : ""}],
  // the welcome tour overlay intercepts pointer events — fatal for e2e
  editorTheme: { tours: false },
};
module.exports = settings;
`;

  const finalRuntimeSettingsFilepath = path.join(
    os.tmpdir(),
    `node-red-settings-final-${process.pid}-${port}.cjs`,
  );

  fs.writeFileSync(finalRuntimeSettingsFilepath, finalRuntimeSettingsFile);
  tempFiles.push(finalRuntimeSettingsFilepath);

  return { filepath: finalRuntimeSettingsFilepath, tempFiles };
}

export {
  findUserRuntimeSettingsFilepath,
  compileRuntimeSettingsFile,
  generateRuntimeSettings,
};
