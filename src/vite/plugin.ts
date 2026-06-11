import type { Plugin } from "vite";
import path from "path";
import type { NrgPluginOptions } from "./types";
import {
  DEFAULT_CLIENT_BUILD_OPTIONS,
  DEFAULT_SERVER_BUILD_OPTIONS,
  DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
  DEFAULT_EXTRA_FILES_COPY_TARGETS,
  DEFAULT_OUTPUT_DIR,
} from "./defaults";
import { getPackageName, mergeOptions, resolveSlug } from "./utils";
import { NodeRedLauncher } from "./node-red-launcher";
import { serverPlugin, buildPlugin } from "./plugins";

/**
 * Vite plugin that builds and serves Node-RED node packages. Handles server
 * bundling, client compilation, type generation, and dev server integration.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { nrg } from "@bonsae/nrg/vite";
 *
 * export default defineConfig({
 *   plugins: [nrg()],
 * });
 * ```
 */
function nrg(options: NrgPluginOptions = {}): Plugin[] {
  const { build = {}, server = {} } = options;
  const { outDir = DEFAULT_OUTPUT_DIR } = build;

  const clientBuildOptions = mergeOptions(
    DEFAULT_CLIENT_BUILD_OPTIONS,
    build.client,
  );
  const serverBuildOptions = mergeOptions(
    DEFAULT_SERVER_BUILD_OPTIONS,
    build.server,
  );
  const nodeRedLauncherOptions = mergeOptions(
    DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
    server.nodeRed,
  );
  const extraFilesCopyTargets =
    build.extraFilesCopyTargets ?? DEFAULT_EXTRA_FILES_COPY_TARGETS;

  const resolvedOutDir = path.resolve(outDir);
  const buildContext = {
    outDir: resolvedOutDir,
    packageName: getPackageName(),
    isDev: process.env.NODE_ENV === "development",
  };
  const slug = resolveSlug(server.slug);
  const nodeRedLauncher = new NodeRedLauncher(
    resolvedOutDir,
    nodeRedLauncherOptions,
    slug,
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

export { nrg };
