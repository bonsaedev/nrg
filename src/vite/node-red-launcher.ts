import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import getPort from "get-port";
import detect from "detect-port";
import { builtinModules } from "module";
import treeKill from "tree-kill";
import fs from "fs";
import os from "os";
import path from "path";
import { build as esbuild } from "esbuild";
import { withTimeout, retry } from "./async-utils";
import { NodeRedStartError } from "./errors";
import { Logger } from "./logger";
import type { Logger, NodeRedLauncherOptions } from "./types";

class NodeRedLauncher {
  private compiledRuntimeSettingsFilepath: string | null = null;
  private process: ChildProcess | null = null;
  private bufferedLogs: string[] = [];
  private isReady: boolean = false;
  private port: number | null = null;

  private readonly outDir: string;
  private readonly options: NodeRedLauncherOptions;
  private readonly logger: Logger;

  constructor(outDir: string, options: NodeRedLauncherOptions) {
    this.outDir = outDir;
    this.options = options;
    this.logger = new Logger({
      name: "vite-plugin-node-red",
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
    return this.process?.pid ?? null;
  }

  get nodeRedCommand(): string {
    const version = this.options.runtime?.version;
    if (version === "latest") {
      return "node-red@latest";
    }
    if (version) {
      return `node-red@${version}`;
    }
    return "node-red";
  }

  private findRuntimeSettingsFilepath(): string | null {
    const runtimeSettingsFilepath = this.options.runtime.settingsFilepath;
    if (runtimeSettingsFilepath) {
      const resolved = path.resolve(runtimeSettingsFilepath);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
      this.logger.warn(`Settings file not found: ${runtimeSettingsFilepath}`);
      return null;
    }

    const resolved = path.resolve("node-red.settings.ts");
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    return null;
  }

  private async compileRuntimeSettingsFile(
    runtimeSettingsFilepath: string,
  ): Promise<string> {
    const compiledRuntimeSettingsFilepath = path.join(
      os.tmpdir(),
      `node-red.settings.${process.pid}.cjs`,
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
        "import.meta.url": JSON.stringify(`file://${settingsFile}`),
      },
      external: [...nodeBuiltins, "node-red", "@node-red/*"],
    });

    this.compiledRuntimeSettingsFilepath = compiledRuntimeSettingsFilepath;
    return compiledRuntimeSettingsFilepath;
  }

  private async generateRuntimeSettingsFile(): Promise<string> {
    const userRuntimeSettingsFilepath = this.findRuntimeSettingsFilepath();
    let compiledRuntimeSettingsFilepath: string | null = null;
    if (userRuntimeSettingsFilepath) {
      compiledRuntimeSettingsFilepath = await this.compileRuntimeSettingsFile(
        userRuntimeSettingsFilepath,
      );
    }

    const outDir = path.resolve(this.outDir).split(path.sep).join("/");
    const cwd = process.cwd().split(path.sep).join("/");
    const userDir = path.resolve(cwd, ".node-red");
    const finalRuntimeSettingsFile = compiledRuntimeSettingsFilepath
      ? `
const compiledRuntimeSettings = require("${compiledRuntimeSettingsFilepath
          .split(path.sep)
          .join("/")}");
const settings = compiledRuntimeSettings.default || compiledRuntimeSettings;
settings.uiPort = ${this.port};
if(!settings.userDir){
    settings.userDir = "${userDir}";
}
settings.nodesDir = settings.nodesDir || [];
if (!settings.nodesDir.includes("${outDir}")) {
  settings.nodesDir.push("${outDir}");
}
if(!settings.flowFile){
  settings.flowFile = "flows.json";
}
module.exports = settings;
`
      : `
const settings = {
  uiPort: ${this.port},
  userDir: "${userDir}",
  flowFile: "flows.json",
  nodesDir: ["${outDir}"],
};
module.exports = settings;
`;

    const finalRuntimeSettingsFilepath = path.join(
      os.tmpdir(),
      `node-red-settings-final-${process.pid}.cjs`,
    );

    fs.writeFileSync(finalRuntimeSettingsFilepath, finalRuntimeSettingsFile);
    this.compiledRuntimeSettingsFilepath = finalRuntimeSettingsFilepath;
    return finalRuntimeSettingsFilepath;
  }

  private log(line: string): void {
    if (line.includes("Server now running at")) {
      return;
    }
    this.logger.raw(line);
  }

  async start(): Promise<number> {
    this.port = await getPort({ port: this.preferredPort });

    const startProcess = (): Promise => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve, reject) => {
        try {
          const settingsPath = await this.generateRuntimeSettingsFile();
          const args = this.options.args ?? [];

          this.bufferedLogs = [];
          this.isReady = false;

          this.process = spawn(
            "npx",
            [this.nodeRedCommand, "-s", settingsPath, ...args],
            {
              stdio: ["ignore", "pipe", "pipe"],
              shell: true,
            },
          );

          this.process.stdout?.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);

            for (const line of lines) {
              if (this.isReady) {
                this.log(line);
              } else {
                this.bufferedLogs.push(line);
              }

              if (
                line.includes("Started flows") ||
                line.includes("Server now running")
              ) {
                this.isReady = true;
                resolve();
              }
            }
          });

          this.process.stderr?.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);

            for (const line of lines) {
              if (this.isReady) {
                this.logger.error(`${line}`);
              } else {
                this.bufferedLogs.push(line);
              }
            }
          });

          this.process.on("error", (error) => {
            reject(new NodeRedStartError(error));
          });

          this.process.on("exit", (code) => {
            if (!this.isReady && code !== 0 && code !== null) {
              reject(
                new NodeRedStartError(
                  new Error(`Process exited with code ${code}`),
                ),
              );
            }
            resolve();
          });
        } catch (error) {
          reject(new NodeRedStartError(error as Error));
        }
      });
    };

    try {
      await retry(startProcess, { attempts: 3, delay: 100 });
      return this.port;
    } catch (error) {
      if (this.process) {
        const pid = this.process.pid;
        if (pid) {
          treeKill(pid, "SIGKILL");
        }
        this.process = null;
      }
      throw new NodeRedStartError(error as Error);
    }
  }

  async stop(skipPortUsageCheck: boolean = false): Promise<void> {
    if (!this.process) return;

    const pid = this.process.pid;
    const currentPort = this.port;

    if (!pid) {
      this.process = null;
      return;
    }

    const stopProcess = new Promise<void>((resolve) => {
      this.process!.once("exit", () => {
        this.process = null;
        resolve();
      });

      treeKill(pid, "SIGTERM", (error) => {
        if (error) {
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            this.process = null;
            resolve();
          }
        }
      });
    });

    try {
      await withTimeout(stopProcess, 10000);
    } catch {
      this.logger.warn("Graceful shutdown timed out, force killing...");
      await new Promise<void>((resolve) => {
        treeKill(pid, "SIGKILL", () => {
          this.process = null;
          resolve();
        });
      });
    }

    if (!skipPortUsageCheck && currentPort) {
      const checkPortUsage = async (): Promise<void> => {
        const availablePort = await detect(currentPort);
        if (availablePort !== currentPort) {
          throw new Error("Port still in use");
        }
      };

      try {
        await retry(checkPortUsage, { attempts: 5, delay: 100 });
      } catch {
        this.logger.warn(
          `Port ${currentPort} may still be in use. If restart fails, try again in a few seconds.`,
        );
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
    if (
      this.compiledRuntimeSettingsFilepath &&
      fs.existsSync(this.compiledRuntimeSettingsFilepath)
    ) {
      fs.unlinkSync(this.compiledRuntimeSettingsFilepath);
      this.compiledRuntimeSettingsFilepath = null;
    }
  }
}

export { NodeRedLauncher };
