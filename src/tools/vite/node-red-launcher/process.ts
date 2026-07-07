import { spawn } from "node:child_process";
import detect from "detect-port";
import getPort from "get-port";
import treeKill from "tree-kill";
import { retry, withTimeout } from "../async-utils";
import { NodeRedStartError } from "../errors";
import type {
  AcquirePortOptions,
  LogSource,
  ManagedProcess,
  StartOptions,
  StopOptions,
  WaitForPortReleaseOptions,
} from "./types";

const READY_MARKERS = ["Started flows", "Server now running"];

function start(options: StartOptions): ManagedProcess {
  const { entryPoint, settingsPath, args, onLine } = options;

  const child = spawn(
    process.execPath,
    [entryPoint, "-s", settingsPath, ...args],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let isReady = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const emitLine = (rawLine: string, source: LogSource): void => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line) return;

    onLine(line, source, isReady);

    if (
      source === "stdout" &&
      READY_MARKERS.some((marker) => line.includes(marker))
    ) {
      isReady = true;
      resolveReady();
    }
  };

  // pipes don't respect line boundaries — buffer the trailing partial line
  // per stream so a ready marker split across chunks is still detected
  const remainders: Record<LogSource, string> = { stdout: "", stderr: "" };

  const handleData = (data: Buffer, source: LogSource): void => {
    const lines = (remainders[source] + data.toString()).split("\n");
    remainders[source] = lines.pop() ?? "";

    for (const line of lines) {
      emitLine(line, source);
    }
  };

  const flushRemainders = (): void => {
    for (const source of ["stdout", "stderr"] as const) {
      const rest = remainders[source];
      remainders[source] = "";
      if (rest) {
        emitLine(rest, source);
      }
    }
  };

  child.stdout?.on("data", (data) => handleData(data, "stdout"));
  child.stderr?.on("data", (data) => handleData(data, "stderr"));

  child.on("error", (error) => {
    rejectReady(new NodeRedStartError(error));
  });

  child.on("exit", (code) => {
    flushRemainders();
    if (!isReady && code !== 0 && code !== null) {
      rejectReady(
        new NodeRedStartError(new Error(`Process exited with code ${code}`)),
      );
      return;
    }
    // a clean exit before ready is not treated as a startup failure
    resolveReady();
  });

  return { child, ready };
}

function kill(pid: number): Promise<void> {
  return new Promise<void>((resolve) => {
    treeKill(pid, "SIGKILL", () => resolve());
  });
}

async function stop(options: StopOptions): Promise<void> {
  const { child, pid, gracefulTimeoutMs = 10_000, logger } = options;

  // the process may already be dead (crash, manual kill) — don't wait for
  // an exit event that already fired, and don't signal a possibly reused pid
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());

    treeKill(pid, "SIGTERM", (error) => {
      if (error) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // process is already gone — nothing left to wait for
          resolve();
        }
      }
    });
  });

  try {
    await withTimeout(exited, gracefulTimeoutMs);
  } catch {
    logger.warn("Graceful shutdown timed out, force killing...");
    await kill(pid);
  }
}

async function acquirePort(options: AcquirePortOptions): Promise<number> {
  const { preferredPort, retryDelay = 2000, logger } = options;

  // Always try the preferred port first. If it's still occupied
  // (e.g. orphaned process from a failed restart), wait briefly
  // and retry before falling back to a random port.
  const available = await detect(preferredPort);
  if (available === preferredPort) {
    return preferredPort;
  }

  logger.warn(`Port ${preferredPort} is still in use, waiting...`);
  await new Promise((resolve) => setTimeout(resolve, retryDelay));

  const retryAvailable = await detect(preferredPort);
  if (retryAvailable === preferredPort) {
    return preferredPort;
  }

  const fallbackPort = await getPort({ port: preferredPort });
  logger.warn(
    `Port ${preferredPort} still occupied, using port ${fallbackPort}`,
  );
  return fallbackPort;
}

async function waitForPortRelease(
  port: number,
  options: WaitForPortReleaseOptions = {},
): Promise<boolean> {
  const { attempts = 10, delay = 300 } = options;

  const checkPortUsage = async (): Promise<void> => {
    const availablePort = await detect(port);
    if (availablePort !== port) {
      throw new Error("Port still in use");
    }
  };

  try {
    await retry(checkPortUsage, { attempts, delay });
    return true;
  } catch {
    return false;
  }
}

export { start, stop, kill, acquirePort, waitForPortRelease };
