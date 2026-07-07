import type { Plugin } from "vite";
import path from "node:path";
import type { NrgPluginOptions } from "./types";
import {
  DEFAULT_CLIENT_BUILD_OPTIONS,
  DEFAULT_SERVER_BUILD_OPTIONS,
  DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
  DEFAULT_EXTRA_FILES_COPY_TARGETS,
  DEFAULT_RESOURCES_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_DEV_OUTPUT_DIR,
} from "./defaults";
import {
  discoverResourceCopyTargets,
  getPackageName,
  mergeOptions,
} from "./utils";
import { NodeRedLauncher } from "./node-red-launcher";
import { serverPlugin, buildPlugin } from "./lifecycle";

/**
 * Whether this run targets local development (build to `.nrg`, resolve the
 * `@bonsae/nrg` toolkit) rather than the publishable artifact (build to `dist`,
 * rewrite to `@bonsae/nrg-runtime`, which is only installed once published).
 *
 * Driven by vite's COMMAND, not `process.env.NODE_ENV` (which `vite build`
 * forces to `production` regardless of `--mode`):
 * - `pnpm dev` (`vite` → command `serve`) → dev: build to `.nrg`, toolkit import.
 * - `pnpm build` (`vite build`, any `--mode`) → not dev: build to `dist`, runtime.
 * - `pnpm preview` runs the `dist` artifact and aliases the runtime to the
 *   toolkit so it boots locally (handled by the preview server, not here).
 */
function resolveIsDev(env: { command: string }): boolean {
  return env.command === "serve";
}

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
  const resourcesDir = path.resolve(DEFAULT_RESOURCES_DIR);
  // Always-copied package files (LICENSE, README) plus every non-pipeline folder
  // dropped under src/resources (examples, etc.) — no config prop needed.
  const extraFilesCopyTargets = [
    ...DEFAULT_EXTRA_FILES_COPY_TARGETS,
    ...discoverResourceCopyTargets(resourcesDir),
  ];

  const resolvedOutDir = path.resolve(outDir); // `pnpm build` → publishable dist
  const resolvedDevOutDir = path.resolve(DEFAULT_DEV_OUTPUT_DIR); // `pnpm dev` → .nrg
  const buildContext = {
    // outDir + isDev are authoritative once the `config` hook runs (from vite's
    // command, see resolveIsDev). These defaults only matter if a build hook
    // somehow ran before `config`, which vite never does.
    outDir: resolvedOutDir,
    packageName: getPackageName(),
    isDev: false,
    serverSrcDir: path.resolve(serverBuildOptions.srcDir ?? "./server"),
    resourcesDir,
  };
  // The launcher only runs in serve mode (the dev server), which always builds
  // to .nrg — so Node-RED's nodesDir points there, never at the project's dist.
  const nodeRedLauncher = new NodeRedLauncher(
    resolvedDevOutDir,
    nodeRedLauncherOptions,
  );

  return [
    {
      // Resolve dev-vs-publish from vite's command before any build/serve hook
      // runs: the dev server builds to .nrg and imports @bonsae/nrg, while a
      // production build writes ./dist and rewrites to @bonsae/nrg-runtime.
      // config() always runs before buildStart/configureServer.
      name: "vite-plugin-node-red:resolve-mode",
      config(_config, env) {
        buildContext.isDev = resolveIsDev(env);
        buildContext.outDir = buildContext.isDev
          ? resolvedDevOutDir
          : resolvedOutDir;
      },
    },
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

export { nrg, resolveIsDev };
