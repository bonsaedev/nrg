import fs from "fs";
import path from "path";
import { build as buildServer } from "@/vite/server/build";
import { build as buildClient } from "@/vite/client/build";
import { NodeRedLauncher } from "@/vite/node-red-launcher";
import type {
  BuildContext,
  ServerBuildOptions,
  ClientBuildOptions,
} from "@/vite/types";

interface NodeRedTestEnvironmentOptions {
  projectDir?: string;
  packageName: string;
  clientName?: string;
  port?: number;
  settingsFile?: string;
  server?: Partial<ServerBuildOptions>;
  client?: Partial<ClientBuildOptions>;
}

class NodeRedTestEnvironment {
  private port: number | null = null;
  private launcher: NodeRedLauncher | null = null;
  private originalCwd: string | null = null;

  private readonly projectDir: string;
  private readonly outDir: string;
  private readonly nodeRedDir: string;
  private readonly installedPkgDir: string;
  private readonly options: NodeRedTestEnvironmentOptions;

  constructor(options: NodeRedTestEnvironmentOptions) {
    this.options = options;
    this.projectDir = path.resolve(options.projectDir ?? process.cwd());
    this.outDir = path.join(this.projectDir, "dist-e2e");
    this.nodeRedDir = path.join(this.projectDir, ".node-red");
    this.installedPkgDir = path.join(
      this.nodeRedDir,
      "node_modules",
      options.packageName,
    );
  }

  get nodeRedPort(): number | null {
    return this.port;
  }

  async setup(): Promise<number> {
    this.originalCwd = process.cwd();
    process.chdir(this.projectDir);

    if (fs.existsSync(this.outDir)) fs.rmSync(this.outDir, { recursive: true });
    fs.mkdirSync(this.outDir, { recursive: true });

    const buildContext: BuildContext = {
      outDir: this.outDir,
      packageName: this.options.packageName,
      isDev: false,
      resourcesDir: path.join(this.projectDir, "src/resources"),
    };

    const serverOpts: ServerBuildOptions = {
      srcDir: path.join(this.projectDir, "src/server"),
      entry: "index.ts",
      format: "esm",
      bundled: [],
      types: false,
      nodeTarget: "node22",
      ...this.options.server,
    };
    await buildServer(serverOpts, buildContext);

    const clientOpts: ClientBuildOptions = {
      srcDir: path.join(this.projectDir, "src/client"),
      entry: "index.ts",
      name: this.options.clientName ?? "NodeRedNodes",
      format: "es",
      external: ["jquery", "node-red", "vue", "@bonsae/nrg/client"],
      globals: { jquery: "$", "node-red": "RED", vue: "Vue" },
      ...this.options.client,
    };
    await buildClient(clientOpts, buildContext);

    fs.mkdirSync(this.installedPkgDir, { recursive: true });
    fs.cpSync(this.outDir, this.installedPkgDir, { recursive: true });

    fs.mkdirSync(this.nodeRedDir, { recursive: true });
    fs.writeFileSync(
      path.join(this.nodeRedDir, ".config.runtime.json"),
      JSON.stringify({ telemetryEnabled: false }),
    );

    const launcherOpts: {
      runtime: { port: number; settingsFilepath?: string };
    } = {
      runtime: { port: this.options.port ?? 1881 },
    };
    if (this.options.settingsFile) {
      launcherOpts.runtime.settingsFilepath = path.resolve(
        this.projectDir,
        this.options.settingsFile,
      );
    }

    this.launcher = new NodeRedLauncher(this.installedPkgDir, launcherOpts);
    this.port = await this.launcher.start();
    this.launcher.flushLogs();

    process.chdir(this.originalCwd);

    return this.port;
  }

  async deployFlow(flow: Record<string, unknown>[]): Promise<void> {
    if (!this.port) {
      throw new Error("Environment not started. Call setup() first.");
    }
    const res = await fetch(`http://localhost:${this.port}/flows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Node-RED-Deployment-Type": "full",
      },
      body: JSON.stringify(flow),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to deploy flow: ${res.status} ${await res.text()}`,
      );
    }
  }

  async teardown(): Promise<void> {
    if (this.launcher) {
      await this.launcher.stop();
      this.launcher.cleanup();
      this.launcher = null;
    }
    if (fs.existsSync(this.outDir)) fs.rmSync(this.outDir, { recursive: true });
    if (fs.existsSync(this.nodeRedDir)) {
      fs.rmSync(this.nodeRedDir, { recursive: true });
    }
    this.port = null;
  }
}

export { NodeRedTestEnvironment };
export type { NodeRedTestEnvironmentOptions };
