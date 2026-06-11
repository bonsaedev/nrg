import { builtinModules } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { build as esbuild } from "esbuild";
import type { Logger } from "../logger";
import type { GenerateRuntimeSettingsOptions, RuntimeSettings } from "./types";

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
  });

  return compiledRuntimeSettingsFilepath;
}

async function generateRuntimeSettings(
  options: GenerateRuntimeSettingsOptions,
): Promise<RuntimeSettings> {
  const { outDir, port, settingsFilepath, httpAdminRoot, logger } = options;
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

  // the dev server proxies the editor under a path prefix; httpAdminRoot must
  // match so Node-RED generates URLs the proxy recognizes. It is
  // framework-managed (like uiPort), so it overrides any user httpAdminRoot
  // while developing
  const httpAdminRootAssignment = httpAdminRoot
    ? `settings.httpAdminRoot = ${JSON.stringify(httpAdminRoot)};\n`
    : "";
  const httpAdminRootEntry = httpAdminRoot
    ? `\n  httpAdminRoot: ${JSON.stringify(httpAdminRoot)},`
    : "";

  const finalRuntimeSettingsFile = compiledRuntimeSettingsFilepath
    ? `
const compiledRuntimeSettings = require(${JSON.stringify(
        compiledRuntimeSettingsFilepath.split(path.sep).join("/"),
      )});
const settings = compiledRuntimeSettings.default || compiledRuntimeSettings;
settings.uiPort = ${port};
${httpAdminRootAssignment}if(!settings.userDir){
    settings.userDir = ${userDirLiteral};
}
settings.nodesDir = settings.nodesDir || [];
if (!settings.nodesDir.includes(${outDirLiteral})) {
  settings.nodesDir.push(${outDirLiteral});
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
  nodesDir: [${outDirLiteral}],${httpAdminRootEntry}
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
