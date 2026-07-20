import type { Plugin, ViteDevServer } from "vite";
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import treeKill from "tree-kill";
import path from "node:path";
const color = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};
import type { ServerPluginOptions } from "../types";
import { debounce } from "es-toolkit";
import { BuildError, NodeRedStartError } from "../errors";
import { logger } from "../logger";
import { cleanDir, copyFiles } from "../utils";
import { build as buildServer } from "../server";
import { build as buildClient } from "../client";

// While the build loads the freshly-built bundle it can emit raw console.warn
// (e.g. nrg's credential-format advisory) and Node process warnings (e.g. the
// punycode deprecation). Those would clobber the active spinner's line, so route
// them into the collector to be flushed cleanly once the build settles.
async function withWarningCapture<T>(run: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn;
  const originalNoDeprecation = process.noDeprecation;
  console.warn = (...args: unknown[]): void =>
    logger.collectWarning(args.map(String).join(" "));
  process.noDeprecation = true;
  try {
    return await run();
  } finally {
    console.warn = originalWarn;
    process.noDeprecation = originalNoDeprecation;
  }
}

function serverPlugin(options: ServerPluginOptions): Plugin {
  const {
    nodeRedLauncher,
    serverBuildOptions,
    clientBuildOptions,
    extraFilesCopyTargets,
    buildContext,
    verbose = false,
  } = options;

  let nodeRedPort: number;
  let initialStartDone = false;
  let isStarting = false;
  let isShuttingDown = false;
  let shutdownStartTime = 0;
  let pendingStart = false;
  let server: ViteDevServer;
  let watcher: FSWatcher | null = null;

  // Quiet: the granular Cleaned/Built/Copied steps are hidden — the caller wraps
  // the whole start in a single spinner. Warnings are collected (not printed) and
  // flushed once the build settles.
  const build = async (clean: boolean = false) => {
    logger.resetWarnings();
    if (clean) {
      cleanDir(buildContext.outDir);
    }
    await withWarningCapture(async () => {
      await buildServer(serverBuildOptions, buildContext, true);
      await buildClient(clientBuildOptions, buildContext, true);
    });
    if (extraFilesCopyTargets.length) {
      copyFiles(extraFilesCopyTargets, buildContext.outDir);
    }
  };

  const start = async (
    clean: boolean = false,
    phase: "initial" | "restart" = "restart",
  ) => {
    if (isStarting) {
      pendingStart = true;
      return;
    }

    isStarting = true;
    pendingStart = false;

    // One spinner spans the whole (re)build + launch. The granular Cleaned/Built/
    // Copied steps stay hidden; only this line and the flushed warnings show.
    const startedAt = Date.now();
    logger.startSpinner(
      phase === "initial"
        ? "Building…"
        : "Restarting Node-RED (editor reconnects automatically)",
    );
    // Let clack paint the first frame before the build blocks the event loop,
    // so "Building…" is visible during the (CPU-bound, non-animating) build.
    await new Promise((resolve) => setImmediate(resolve));

    try {
      await nodeRedLauncher.stop();
      await build(clean);
      if (phase === "initial") logger.updateSpinner("Starting Node-RED");
      // The wire-check plugin (auto-loaded into Node-RED via nodesDir) extracts
      // this package's node types from the server source dir; the Node-RED
      // child process inherits our env, so this is the srcDir handoff.
      process.env.NRG_WIRE_CHECK_SRC = path.resolve(
        serverBuildOptions.srcDir ?? "./server",
      );
      nodeRedPort = await nodeRedLauncher.start();

      const proxyConfig = server.config.server.proxy;
      if (proxyConfig && typeof proxyConfig === "object") {
        const rule = proxyConfig["^/.*"];
        if (rule && typeof rule === "object") {
          (rule as any).target = `http://127.0.0.1:${nodeRedPort}`;
        }
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      // Settle the spinner with a timing line for BOTH the initial build and a
      // rebuild. Clack's spinner.stop() ALWAYS paints a final frame, so the old
      // no-message stop on the initial phase left a bare, reasonless glyph (◇)
      // on screen — always give it a message instead.
      logger.stopSpinner(`Node-RED ready · ${elapsed}s`);
      logger.flushWarnings(verbose);
    } catch (error) {
      // Surface the underlying cause — the Rollup/esbuild error with its file,
      // line, and code frame — not just the wrapper's generic message. (The
      // production `buildPlugin` already does this; the dev path had dropped it.)
      if (error instanceof BuildError) {
        logger.error(`Rebuild failed: ${error.message}`, error.cause);
      } else if (error instanceof NodeRedStartError) {
        logger.error("Failed to restart Node-RED", error.cause);
      } else {
        logger.error(
          `Unexpected error: ${(error as Error).message}`,
          error as Error,
        );
      }

      throw error;
    } finally {
      isStarting = false;

      if (pendingStart) {
        // Re-run for the change that landed mid-build. Not awaited, so swallow
        // its rejection here — it self-logs, and an uncaught one would surface
        // as a bare Node "UnhandledPromiseRejection".
        void start(false).catch(() => {});
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
    name: "vite-plugin-nrg:server",
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
                proxy.on("error", (_err, req, res) => {
                  const target = `http://127.0.0.1:${nodeRedPort || nodeRedLauncher.preferredPort}`;
                  (proxy as any).options.target = target;

                  const isHttp = !!res && "writeHead" in res;

                  // During a restart Node-RED is briefly down. Retry HTTP for a
                  // short window (~3s) so requests succeed once it's back instead
                  // of 502-ing the editor (which drives reconnect churn). WS
                  // upgrades drop quietly — the editor reconnects on its own.
                  if (isStarting && isHttp) {
                    const r = req as any;
                    r.__nrgRetries = (r.__nrgRetries ?? 0) + 1;
                    if (r.__nrgRetries <= 20) {
                      setTimeout(
                        () => (proxy as any).web(req, res, { target }),
                        150,
                      );
                      return;
                    }
                  }

                  if (isHttp && !(res as any).headersSent) {
                    (res as any).writeHead(502);
                    (res as any).end();
                  } else if (res && "destroy" in res) {
                    (res as any).destroy();
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
          warn: (...args: any[]) => {
            const msg = args.map(String).join(" ");
            if (isStarting && logger.isTransient(msg)) return;
            console.warn(...args);
          },
          error: (...args: any[]) => {
            const msg = args.map(String).join(" ");
            if (isStarting && logger.isTransient(msg)) return;
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
      await start(true, "initial");
      initialStartDone = true;

      // Report the ACTUAL Vite port, not the configured default: Vite
      // auto-increments (5173 → 5174 …) when the port is taken, but this hook
      // runs before the server binds, so `config.server.port` is still the
      // default here. Read the bound port off the http server once it listens.
      const announce = () => {
        const address = server.httpServer?.address();
        const vitePort =
          address && typeof address === "object"
            ? address.port
            : (server.config.server.port ?? 5173);
        printServerUrls(vitePort, {
          actual: nodeRedPort,
          preferred: nodeRedLauncher.preferredPort,
        });
        logger.startGroup("Node-RED");
        nodeRedLauncher.flushLogs();
      };
      if (server.httpServer?.listening) {
        announce();
      } else {
        server.httpServer?.once("listening", announce);
      }

      const serverSrcDir = path.resolve(
        serverBuildOptions.srcDir ?? "./server",
      );
      const clientSrcDir = path.resolve(
        clientBuildOptions.srcDir ?? "./client",
      );

      // Watch the whole resources convention dir (icons, locales, examples, …)
      // so any change rebuilds; the per-type paths are derived in the build.
      const watchPaths = [
        serverSrcDir,
        clientSrcDir,
        buildContext.resourcesDir,
      ];

      watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        persistent: true,
        ignored: ["**/node_modules/**", "**/dist/**", "**/.node-red/**"],
      });

      const debounceBeforeStart = debounce(
        // Not awaited by the debouncer — swallow the rejection (it self-logs)
        // so a failed rebuild doesn't bubble up as an "UnhandledPromiseRejection".
        () => void start(false).catch(() => {}),
        nodeRedLauncher.restartDelay ?? 1000,
      );

      const handleFileChange = (file: string, event: string) => {
        if (!initialStartDone) return;
        logger.changed(event, path.relative(process.cwd(), file));
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

      // A non-interactive stop (SIGTERM from `kill`, an IDE/supervisor) must also
      // reap Node-RED. Without a listener the default action terminates the vite
      // process WITHOUT running our `exit` net, orphaning the detached child so it
      // camps its port. Mirror the graceful path once.
      process.on("SIGTERM", () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        nodeRedLauncher
          .stop(true)
          .then(() => nodeRedLauncher.cleanup())
          .catch(() => {})
          .finally(() => process.exit(0));
      });

      // Last-resort SYNCHRONOUS net: on any process exit (a handler above calling
      // process.exit, an uncaught fatal, or a normal exit), SIGKILL the detached
      // Node-RED process group so it can never be left orphaned camping a port.
      // `pid` is null once a graceful stop has already reaped it, so this only
      // fires on an abrupt exit. Only sync work is allowed in an `exit` handler.
      process.on("exit", () => {
        const pid = nodeRedLauncher.pid;
        if (pid && process.platform !== "win32") {
          try {
            process.kill(-pid, "SIGKILL"); // negative pid → the child's group
          } catch {
            /* already gone */
          }
        }
      });
    },
  };
}

export { serverPlugin };
