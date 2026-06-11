import fs from "fs";
import { retry } from "../async-utils";
import { NodeRedStartError } from "../errors";
import { Logger } from "../logger";
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
  private bufferedLogs: string[] = [];
  private port: number | null = null;

  private readonly outDir: string;
  private readonly options: NodeRedLauncherOptions;
  private readonly _slug: string;
  private readonly logger: Logger;

  constructor(
    outDir: string,
    options: NodeRedLauncherOptions,
    slug: string = "",
  ) {
    this.outDir = outDir;
    this.options = options;
    this._slug = slug;
    this.logger = new Logger({
      name: "vite-plugin-node-red",
      prefix: "node-red",
    });
  }

  get preferredPort(): number {
    return this.options.runtime?.port ?? 1880;
  }

  get slug(): string {
    return this._slug;
  }

  get basePath(): string {
    return this._slug ? `/${this._slug}/` : "/";
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

  private handleProcessLine(
    line: string,
    source: LogSource,
    ready: boolean,
  ): void {
    if (!ready) {
      this.bufferedLogs.push(line);
    } else if (source === "stderr") {
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
      this.port = await nodeRedProcess.acquirePort({
        preferredPort: this.preferredPort,
        logger: this.logger,
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
        httpAdminRoot: this._slug ? this.basePath : undefined,
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
          onLine: (line, source, ready) =>
            this.handleProcessLine(line, source, ready),
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
      this.port = null;
      return;
    }

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

    this.port = null;
  }

  flushLogs(): void {
    for (const line of this.bufferedLogs) {
      this.log(line);
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
