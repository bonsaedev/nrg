import type { Plugin, FSWatcher, ViteDevServer } from "vite";
import chokidar from "chokidar";
import path from "path";
const color = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};
import type { ServerPluginOptions } from "../types";
import { debounce } from "../async-utils";
import { BuildError, NodeRedStartError } from "../errors";
import { logger } from "../logger";
import { cleanDir, copyFiles } from "../utils";
import { build as buildServer } from "../server";
import { build as buildClient } from "../client";

function serverPlugin(options: ServerPluginOptions): Plugin {
  const {
    nodeRedLauncher,
    serverBuildOptions,
    clientBuildOptions,
    extraFilesCopyTargets,
    buildContext,
  } = options;

  let nodeRedPort: number;
  let initialStartDone = false;
  let isStarting = false;
  let isShuttingDown = false;
  let shutdownStartTime = 0;
  let pendingStart = false;
  let server: ViteDevServer;
  let watcher: FSWatcher | null = null;

  const build = async (clean: boolean = false) => {
    if (clean) {
      logger.startSpinner("Cleaning");
      cleanDir(buildContext.outDir);
      logger.stopSpinner("Cleaned");
    }

    logger.startSpinner("Building");
    await buildServer(serverBuildOptions, buildContext);
    await buildClient(clientBuildOptions, buildContext);
    logger.stopSpinner("Built");

    if (extraFilesCopyTargets.length) {
      logger.startSpinner("Copying extra files");
      copyFiles(extraFilesCopyTargets, buildContext.outDir);
      logger.stopSpinner("Copied extra files");
    }
  };

  const start = async (clean: boolean = false) => {
    if (isStarting) {
      pendingStart = true;
      return;
    }

    isStarting = true;
    pendingStart = false;

    try {
      await nodeRedLauncher.stop();
      await build(clean);

      logger.startSpinner("Starting Node-RED");
      nodeRedPort = await nodeRedLauncher.start();
      logger.stopSpinner("Node-RED started");

      const proxyConfig = server.config.server.proxy;
      if (proxyConfig && typeof proxyConfig === "object") {
        const rule = proxyConfig["^/.*"];
        if (rule && typeof rule === "object") {
          (rule as any).target = `http://127.0.0.1:${nodeRedPort}`;
        }
      }
      logger.success("Ready");
    } catch (error) {
      if (error instanceof BuildError) {
        logger.error(`Rebuild failed: ${error.message}`);
      } else if (error instanceof NodeRedStartError) {
        logger.error("Failed to restart Node-RED");
      } else {
        logger.error(`Unexpected error: ${(error as Error).message}`);
      }

      throw error;
    } finally {
      isStarting = false;

      if (pendingStart) {
        start(false);
      }
    }
  };

  const printServerUrls = (
    vitePort: number,
    nodeRedPorts: {
      actual: number;
      preferred: number;
    },
  ) => {
    console.log();
    console.log(
      `  ${color.cyan("Vite")}      ${color.dim("➜")}  ${color.cyan(`http://127.0.0.1:${vitePort}/`)}`,
    );
    if (nodeRedPorts.actual != nodeRedPorts.preferred) {
      console.log(
        `  ${color.green("Node-RED")}  ${color.dim("➜")}  ${color.green(`http://127.0.0.1:${nodeRedPorts.actual}/`)} ${color.yellow(`(port ${nodeRedPorts.preferred} was in use)`)}`,
      );
    } else {
      console.log(
        `  ${color.green("Node-RED")}  ${color.dim("➜")}  ${color.green(`http://127.0.0.1:${nodeRedPorts.actual}/`)}`,
      );
    }
    console.log();
  };

  return {
    name: "vite-plugin-node-red:server",
    apply: "serve",

    config() {
      return {
        appType: "custom",
        server: {
          host: "127.0.0.1",
          proxy: {
            "^/.*": {
              target: `http://127.0.0.1:${nodeRedLauncher.preferredPort}`,
              changeOrigin: true,
              ws: true,
              configure: (proxy) => {
                proxy.on("error", (_err, _req, res) => {
                  if (nodeRedPort) {
                    (proxy as any).options.target =
                      `http://127.0.0.1:${nodeRedPort}`;
                  }
                  if (res && !res.headersSent && "writeHead" in res) {
                    (res as any).writeHead(502);
                    (res as any).end();
                  }
                });
              },
            },
          },
          watch: {
            // NOTE: this is necessary to avoid default hmr in .html files. Watcher is configured manually
            ignored: ["**/*"],
          },
        },
        customLogger: {
          ...console,
          info: () => {},
          warn: console.warn,
          error: (...args: any[]) => {
            const msg = args.map(String).join(" ");
            if (isStarting && msg.includes("ECONNREFUSED")) return;
            console.error(...args);
          },
          warnOnce: () => {},
          hasWarned: false,
          clearScreen: () => {},
          hasErrorLogged: () => false,
        },
      };
    },

    async configureServer(viteServer) {
      server = viteServer;

      logger.intro();
      await start(true);
      initialStartDone = true;

      printServerUrls(server.config.server.port ?? 5173, {
        actual: nodeRedPort,
        preferred: nodeRedLauncher.preferredPort,
      });

      logger.startGroup("Node-RED");
      nodeRedLauncher.flushLogs();

      const serverSrcDir = path.resolve(
        serverBuildOptions.srcDir ?? "./server",
      );
      const clientSrcDir = path.resolve(
        clientBuildOptions.srcDir ?? "./client",
      );
      const localesDocsDir = path.resolve(
        clientBuildOptions.locales?.docsDir ?? "./locales/docs",
      );
      const localesLabelsDir = path.resolve(
        clientBuildOptions.locales?.labelsDir ?? "./locales/labels",
      );
      const iconsDir = path.resolve(
        clientBuildOptions.staticDirs?.icons ??
          path.join(path.dirname(clientSrcDir), "icons"),
      );

      const watchPaths = [
        serverSrcDir,
        clientSrcDir,
        localesDocsDir,
        localesLabelsDir,
        iconsDir,
      ];

      watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        persistent: true,
        ignored: ["**/node_modules/**", "**/dist/**", "**/.node-red/**"],
      });

      const debounceBeforeStart = debounce(
        () => start(false),
        nodeRedLauncher.restartDelay ?? 1000,
      );

      const handleFileChange = (file: string, event: string) => {
        if (!initialStartDone) return;
        logger.info(`${event}: ${path.relative(process.cwd(), file)}`);
        debounceBeforeStart();
      };

      watcher.on("change", (file) => handleFileChange(file, "Changed"));
      watcher.on("add", (file) => handleFileChange(file, "Added"));
      watcher.on("unlink", (file) => handleFileChange(file, "Deleted"));

      process.on("SIGINT", () => {
        const now = Date.now();

        // NOTE: enable force exit only if more than 1 second has passed since first Ctrl+C because multiple SIGINT are triggered at once
        if (isShuttingDown && now - shutdownStartTime > 1000) {
          const pid = nodeRedLauncher.pid;
          if (pid) {
            try {
              treeKill(pid, "SIGKILL");
            } catch {
              /* empty */
            }
          }
          logger.endGroup("Node-RED Stopped");
          process.exit(1);
        }

        if (isShuttingDown) {
          // NOTE: ignoring sequential SIGNINT when it is already shutting down
          return;
        }

        isShuttingDown = true;
        shutdownStartTime = now;

        logger.warn("Shutting down gracefully... (Ctrl+C again to force)");

        nodeRedLauncher
          .stop(true)
          .then(() => {
            nodeRedLauncher.cleanup();
            logger.endGroup("Node-RED Stopped");
            process.exit(0);
          })
          .catch(() => {
            process.exit(1);
          });
      });
    },
  };
}

export { serverPlugin };
