import type { Plugin } from "vite";
import path from "path";
import type { NodeRedPluginOptions } from "./types";
import {
  DEFAULT_CLIENT_BUILD_OPTIONS,
  DEFAULT_SERVER_BUILD_OPTIONS,
  DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
  DEFAULT_EXTRA_FILES_COPY_TARGETS,
  DEFAULT_OUTPUT_DIR,
} from "./defaults";
import { getPackageName, mergeOptions } from "./utils";
import { NodeRedLauncher } from "./node-red-launcher";
import { serverPlugin, buildPlugin } from "./plugins";

function nodeRed(options: NodeRedPluginOptions = {}): Plugin[] {
  const { outDir = DEFAULT_OUTPUT_DIR } = options;

  const clientBuildOptions = mergeOptions(
    DEFAULT_CLIENT_BUILD_OPTIONS,
    options.clientBuildOptions,
  );
  const serverBuildOptions = mergeOptions(
    DEFAULT_SERVER_BUILD_OPTIONS,
    options.serverBuildOptions,
  );
  const nodeRedLauncherOptions = mergeOptions(
    DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
    options.nodeRedLauncherOptions,
  );
  const extraFilesCopyTargets =
    options.extraFilesCopyTargets ?? DEFAULT_EXTRA_FILES_COPY_TARGETS;

  const resolvedOutDir = path.resolve(outDir);
  const buildContext = {
    outDir: resolvedOutDir,
    packageName: getPackageName(),
    isDev: process.env.NODE_ENV === "development",
  };
  const nodeRedLauncher = new NodeRedLauncher(
    resolvedOutDir,
    nodeRedLauncherOptions,
  );

  return [
    serverPlugin({
      nodeRedLauncher,
      serverBuildOptions,
      clientBuildOptions,
      extraFilesCopyTargets,
      buildContext,
    }),
    buildPlugin({
      serverBuildOptions,
      clientBuildOptions,
      extraFilesCopyTargets,
      buildContext,
    }),
  ];
}

export { nodeRed };
