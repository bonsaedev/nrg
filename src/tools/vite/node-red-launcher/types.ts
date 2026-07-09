import type { ChildProcess } from "node:child_process";
import type { Logger } from "../logger";

type LogSource = "stdout" | "stderr";

interface ResolveNodeRedOptions {
  version?: string;
  /** Timeout for the npx resolution command. @default 300000 */
  npxTimeoutMs?: number;
  logger: Logger;
}

interface GenerateRuntimeSettingsOptions {
  outDir: string;
  port: number;
  settingsFilepath?: string;
  logger: Logger;
}

interface RuntimeSettings {
  filepath: string;
  /** Every temp file created, so the caller can clean all of them up. */
  tempFiles: string[];
}

interface ResolvePortOptions {
  /** Port to start from; advances upward past occupied ports (never random). */
  startPort: number;
  logger: Logger;
}

interface WaitForPortReleaseOptions {
  attempts?: number;
  delay?: number;
}

interface StartOptions {
  entryPoint: string;
  settingsPath: string;
  args: string[];
  onLine: (line: string, source: LogSource, ready: boolean) => void;
}

interface ManagedProcess {
  child: ChildProcess;
  /**
   * Resolves when Node-RED reports ready ("Started flows" / "Server now
   * running") or exits cleanly; rejects on spawn error or non-zero exit
   * before ready.
   */
  ready: Promise<void>;
}

interface StopOptions {
  child: ChildProcess;
  pid: number;
  /** Time to wait for graceful exit before SIGKILL. @default 10000 */
  gracefulTimeoutMs?: number;
  logger: Logger;
}

export type {
  LogSource,
  ResolveNodeRedOptions,
  GenerateRuntimeSettingsOptions,
  RuntimeSettings,
  ResolvePortOptions,
  WaitForPortReleaseOptions,
  StartOptions,
  ManagedProcess,
  StopOptions,
};
