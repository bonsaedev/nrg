import { spawn, execFile } from "node:child_process";
import detect from "detect-port";
import treeKill from "tree-kill";
import { retry, withTimeout } from "../async-utils";
import { NodeRedStartError } from "../errors";
import type {
  ResolvePortOptions,
  LogSource,
  ManagedProcess,
  StartOptions,
  StopOptions,
  WaitForPortReleaseOptions,
} from "./types";

const READY_MARKERS = ["Started flows", "Server now running"];

const isWindows = process.platform === "win32";

/** Run a command and resolve its stdout, or "" if it errors/exits non-zero. */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, (error, stdout) => resolve(error ? "" : stdout));
  });
}

// The generated Node-RED settings file always carries this marker in its name
// (see settings.ts) — the only reliable, universal signal that a process on the
// port is an nrg-launched Node-RED (and thus safe for us to reap), never a
// user's own server.
const NRG_SETTINGS_MARKER = "node-red-settings-final-";

function start(options: StartOptions): ManagedProcess {
  const { entryPoint, settingsPath, args, onLine } = options;

  const child = spawn(
    process.execPath,
    [entryPoint, "-s", settingsPath, ...args],
    {
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group (pgid === child.pid on POSIX) so `stop()` can reap the
      // WHOLE tree with a single `process.kill(-pid)` — Node-RED forks/helpers
      // included — instead of relying on tree-kill walking `ps` (which misses
      // re-parented or just-spawned descendants and leaks orphans that camp the
      // port). Not unref'd: we keep piping its stdio and managing its lifetime.
      detached: !isWindows,
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

/** Signal the whole process group (POSIX); fall back to tree-kill on Windows. */
function signalTree(pid: number, signal: NodeJS.Signals): void {
  if (isWindows) {
    treeKill(pid, signal);
    return;
  }
  // Negative pid → the process group led by `pid` (child spawned detached).
  try {
    process.kill(-pid, signal);
  } catch {
    // group already gone, or leader reaped — try the bare pid as a last resort
    try {
      process.kill(pid, signal);
    } catch {
      // already dead
    }
  }
}

function kill(pid: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (isWindows) {
      treeKill(pid, "SIGKILL", () => resolve());
      return;
    }
    signalTree(pid, "SIGKILL");
    resolve();
  });
}

async function stop(options: StopOptions): Promise<void> {
  const { child, pid, gracefulTimeoutMs = 8_000, logger } = options;

  // the process may already be dead (crash, manual kill) — don't wait for
  // an exit event that already fired, and don't signal a possibly reused pid
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  // The authoritative "it's gone" signal is OUR child's exit event, not a port
  // probe — a dead listener frees the port instantly (no TIME_WAIT on listening
  // sockets), so process death is the only thing gating a clean rebind.
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );

  signalTree(pid, "SIGTERM");

  try {
    await withTimeout(exited, gracefulTimeoutMs);
  } catch {
    logger.warn("Graceful shutdown timed out, force killing process group...");
    signalTree(pid, "SIGKILL");
    await withTimeout(exited, 2_000).catch(() => {
      // best-effort: the group signal was sent; the port reaper will catch a
      // stray survivor on the next start
    });
  }
}

/** PIDs currently LISTENing on `port` (POSIX via lsof; empty elsewhere). */
async function listListeners(port: number): Promise<number[]> {
  if (isWindows) return []; // lsof-free path: rely on the child-exit gate only
  // lsof exits non-zero when nothing matches → run() yields "" → no listeners.
  const stdout = await run("lsof", [
    "-nP",
    `-iTCP:${port}`,
    "-sTCP:LISTEN",
    "-t",
  ]);
  return stdout
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** Whether `pid`'s command line is an nrg-launched Node-RED. */
async function isNrgNodeRed(pid: number): Promise<boolean> {
  if (isWindows) return false;
  // `-ww` disables ps's column-width truncation: the settings marker sits LATE
  // in a long `node <red.js> -s <…/node-red-settings-final-*.js>` command, and
  // without `-ww` BSD/macOS ps clips it to the terminal width, dropping the
  // marker so a genuine orphan reads as foreign and is never reaped.
  const stdout = await run("ps", ["-ww", "-o", "command=", "-p", String(pid)]);
  return stdout.includes(NRG_SETTINGS_MARKER);
}

/**
 * Whether `pid` was orphaned — its launcher died, so the OS reparented it to
 * init (ppid 1). A live server (sibling project, a second dev of this project,
 * a foreign process) has a live parent and is never reaped.
 */
async function isOrphaned(pid: number): Promise<boolean> {
  if (isWindows) return false;
  const stdout = await run("ps", ["-o", "ppid=", "-p", String(pid)]);
  return Number(stdout.trim()) === 1;
}

const MAX_PORT_ADVANCE = 100;

/**
 * Resolve a usable port, starting at `startPort` and advancing upward past any
 * occupied port. Abandoned nrg Node-REDs (our own crashes — nrg-launched AND
 * reparented to init) are reaped so we reclaim the port; a LIVE server on the
 * port (sibling project, second dev of this project, foreign process) is left
 * alone and we advance past it. Never randomizes and never kills a live server.
 */
async function resolvePort(options: ResolvePortOptions): Promise<number> {
  const { startPort } = options;

  for (let port = startPort; port < startPort + MAX_PORT_ADVANCE; port++) {
    const holders = await listListeners(port);
    if (holders.length === 0) return port; // free — use it

    let reaped = false;
    for (const pid of holders) {
      if ((await isNrgNodeRed(pid)) && (await isOrphaned(pid))) {
        // Reclaim an orphaned nrg Node-RED holding the port; the chosen port is
        // reported once by the server URLs, so the search stays quiet.
        signalTree(pid, "SIGKILL");
        reaped = true;
      }
    }
    if (
      reaped &&
      (await waitForPortRelease(port, { attempts: 20, delay: 150 }))
    ) {
      return port; // orphan cleared, port reclaimed
    }

    // Held by something live/foreign — advance rather than fight or kill it.
  }

  throw new NodeRedStartError(
    new Error(`No free port available near ${startPort}`),
  );
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

export { start, stop, kill, resolvePort, waitForPortRelease };
