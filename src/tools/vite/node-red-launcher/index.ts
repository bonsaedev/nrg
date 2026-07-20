import fs from "node:fs";
import { retry } from "../async-utils";
import { NodeRedStartError } from "../errors";
import { Logger, logger as globalLogger } from "../logger";
import { getNodeRedCommand, resolveNodeRed } from "./entry-point";
import { generateRuntimeSettings } from "./settings";
import * as nodeRedProcess from "./process";
import type { LogSource, ManagedProcess } from "./types";
import type {
  NodeRedLauncherOptions,
  NodeRedLauncher as INodeRedLauncher,
} from "../types";

class NodeRedLauncher implements INodeRedLauncher {
  private operationQueue: Promise<unknown> = Promise.resolve();
  private process: ManagedProcess | null = null;
  private unwatchExit: (() => void) | null = null;
  private nodeRedEntryPoint: string | null = null;
  private tempFiles: string[] = [];
  private bufferedLogs: { line: string; source: LogSource }[] = [];
  // Node-RED logs are held until `flushLogs()` runs — which the dev server calls
  // AFTER printing the Vite/Node-RED links banner — so every Node-RED line lands
  // beneath the banner in one block, never split across it. The process's own
  // `ready` flag is NOT enough: the banner is gated on Vite's httpServer
  // `listening` event, so live lines would otherwise leak out before it.
  private live = false;
  private port: number | null = null;

  private readonly outDir: string;
  private readonly options: NodeRedLauncherOptions;
  private readonly logger: Logger;

  constructor(outDir: string, options: NodeRedLauncherOptions) {
    this.outDir = outDir;
    this.options = options;
    this.logger = new Logger({
      name: "vite-plugin-nrg",
      prefix: "node-red",
    });
  }

  get preferredPort(): number {
    return this.options.runtime?.port ?? 1880;
  }

  get restartDelay(): number {
    return this.options.restartDelay ?? 1000;
  }

  get pid(): number | null {
    return this.process?.child.pid ?? null;
  }

  get nodeRedCommand(): string {
    return getNodeRedCommand(this.options.runtime?.version);
  }

  private log(line: string): void {
    if (line.includes("Server now running at")) {
      return;
    }
    this.logger.raw(line);
  }

  private handleProcessLine(line: string, source: LogSource): void {
    if (!this.live) {
      this.bufferedLogs.push({ line, source });
      return;
    }
    this.emit(line, source);
  }

  private emit(line: string, source: LogSource): void {
    if (source === "stderr") {
      this.logger.error(line);
    } else {
      this.log(line);
    }
  }

  private async killProcess(): Promise<void> {
    if (!this.process) return;
    this.stopWatchingExit();
    const pid = this.process.child.pid;
    if (pid) {
      await nodeRedProcess.kill(pid);
    }
    this.process = null;
  }

  private watchForUnexpectedExit(managed: ManagedProcess): void {
    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      this.unwatchExit = null;
      this.process = null;
      this.logger.warn(
        `Node-RED exited unexpectedly (${signal ?? `code ${code}`})`,
      );
    };
    managed.child.once("exit", onExit);
    this.unwatchExit = () => managed.child.off("exit", onExit);
  }

  private stopWatchingExit(): void {
    this.unwatchExit?.();
    this.unwatchExit = null;
  }

  // start/stop interleaving (e.g. SIGINT while Node-RED is booting) would
  // race on process/port state and could leak a spawned process, so all
  // lifecycle operations run strictly one at a time
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.catch(() => {});
    return result;
  }

  async start(): Promise<number> {
    return this.enqueue(() => this.doStart());
  }

  async stop(skipPortUsageCheck: boolean = false): Promise<void> {
    return this.enqueue(() => this.doStop(skipPortUsageCheck));
  }

  private async doStart(): Promise<number> {
    try {
      // Resolve a port and pin it for the session: reuse the one we already
      // landed on across restarts (kept in memory), so the URL never churns.
      // First run starts at the preferred port; a busy port auto-advances,
      // abandoned orphans of ours are reaped — never a random port.
      const startPort = this.port ?? this.preferredPort;
      // Pass the GLOBAL logger (whose spinner is the active "Starting Node-RED"
      // line) so the port search updates that spinner in place; this.logger has
      // its own inactive spinner, so its updateSpinner would be a no-op.
      this.port = await nodeRedProcess.resolvePort({
        startPort,
        logger: globalLogger,
      });

      // resolution can shell out to npx (slow), so cache it across restarts;
      // re-validate in case the resolved file was removed mid-session
      if (!this.nodeRedEntryPoint || !fs.existsSync(this.nodeRedEntryPoint)) {
        this.nodeRedEntryPoint = await resolveNodeRed({
          version: this.options.runtime?.version,
          logger: this.logger,
        });
      }
      const nodeRedEntryPoint = this.nodeRedEntryPoint;

      const settings = await generateRuntimeSettings({
        outDir: this.outDir,
        port: this.port,
        settingsFilepath: this.options.runtime?.settingsFilepath,
        logger: this.logger,
      });
      for (const file of settings.tempFiles) {
        if (!this.tempFiles.includes(file)) {
          this.tempFiles.push(file);
        }
      }

      const startProcess = async (): Promise<void> => {
        // a failed previous attempt may have left a half-started process
        // behind — kill it so retries don't orphan processes on the port
        await this.killProcess();
        this.bufferedLogs = [];

        this.process = nodeRedProcess.start({
          entryPoint: nodeRedEntryPoint,
          settingsPath: settings.filepath,
          args: this.options.args ?? [],
          onLine: (line, source) => this.handleProcessLine(line, source),
        });

        await this.process.ready;
      };

      await retry(startProcess, { attempts: 3, delay: 100 });
      this.watchForUnexpectedExit(this.process!);
      return this.port;
    } catch (error) {
      await this.killProcess();
      throw error instanceof NodeRedStartError
        ? error
        : new NodeRedStartError(error as Error);
    }
  }

  private async doStop(skipPortUsageCheck: boolean): Promise<void> {
    if (!this.process) return;
    this.stopWatchingExit();

    const pid = this.process.child.pid;
    const currentPort = this.port;

    if (!pid) {
      this.process = null;
      return;
    }

    // `stop` gates on the child's exit event, so the port is free once it
    // returns. Keep `this.port` set: restarts reuse it so the URL stays put.
    await nodeRedProcess.stop({
      child: this.process.child,
      pid,
      logger: this.logger,
    });
    this.process = null;

    if (!skipPortUsageCheck && currentPort) {
      const released = await nodeRedProcess.waitForPortRelease(currentPort);
      if (!released) {
        this.logger.warn(
          `Port ${currentPort} still in use after stop. Force killing...`,
        );
        await nodeRedProcess.kill(pid);
        await nodeRedProcess.waitForPortRelease(currentPort);
      }
    }
  }

  flushLogs(): void {
    // Called after the links banner is printed: drain everything Node-RED has
    // said so far (in order, preserving stderr routing), then switch to live so
    // later lines stream straight through beneath the banner.
    this.live = true;
    for (const { line, source } of this.bufferedLogs) {
      this.emit(line, source);
    }
    this.bufferedLogs = [];
  }

  cleanup(): void {
    for (const file of this.tempFiles) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
    this.tempFiles = [];
  }
}

export { NodeRedLauncher };
