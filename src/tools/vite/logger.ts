import type { Logger as ViteLogger } from "vite";
import type { LoggerOptions } from "./types";

// ANSI color is opt-out via NO_COLOR (https://no-color.org): set it to any
// non-empty value and every style below becomes a no-op, so piped / CI logs are
// plain text. The words are the only thing colored — no glyphs, gutter, or
// spinner (this used to wrap @clack/prompts, whose TUI rendered as junk when
// stdout wasn't a TTY and whose spinner swallowed real errors).
const useColor = !process.env.NO_COLOR;
const style =
  (code: string) =>
  (s: string): string =>
    useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
const color = {
  dim: style("2"),
  cyan: style("36"),
  yellow: style("33"),
  red: style("31"),
  green: style("32"),
};

// eslint-disable-next-line no-control-regex -- intentionally strips ANSI SGR codes
const ANSI = /\x1b\[[0-9;]*m/g;

type WarnCategory =
  | "directive"
  | "sourcemap"
  | "circular"
  | "bundle-size"
  | "eval"
  | "empty-chunk"
  | "dependency"
  | "actionable";

// Non-actionable warning classes a consumer can't fix (they live in
// dependencies). Each maps to a short label used in the collapsed summary.
const BENIGN_WARNINGS: { re: RegExp; category: WarnCategory }[] = [
  { re: /["']use (client|server)["']/i, category: "directive" },
  { re: /source ?map .*(missing|points to missing)/i, category: "sourcemap" },
  { re: /circular dependenc/i, category: "circular" },
  {
    re: /larger than \d+\s*k?b after|chunks are larger than/i,
    category: "bundle-size",
  },
  { re: /use of eval/i, category: "eval" },
  { re: /generated an empty chunk/i, category: "empty-chunk" },
  { re: /DeprecationWarning|\[DEP\d+\]/i, category: "dependency" },
];

// Proxy/socket errors that are expected while Node-RED is down mid-restart —
// the editor reconnects on its own, so they're noise, not failures.
const TRANSIENT_LOG =
  /ECONNREFUSED|ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|proxy error|websocket|connect ECONNREFUSED/i;

interface WarnEntry {
  count: number;
  category: WarnCategory;
  message: string;
}

function classifyWarning(message: string): WarnCategory {
  for (const { re, category } of BENIGN_WARNINGS) {
    if (re.test(message)) return category;
  }
  // Anything else in a dependency is still non-actionable; a warning about the
  // author's own code is the only kind worth showing in full.
  if (/node_modules/.test(message)) return "dependency";
  return "actionable";
}

// Collapse volatile bits (hashes, line/col numbers, sizes) so the "same"
// warning across files/chunks dedupes to one entry with a count.
function warningSignature(message: string): string {
  return message
    .replace(/[a-f0-9]{8,}/gi, "·")
    .replace(/\d+(\.\d+)?/g, "·")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

export class Logger {
  private readonly name: string;
  private readonly prefix?: string;

  // Build-warning preprocessing state: warnings routed in via viteWarnLogger()
  // are classified and deduped here, then flushed collapsed (or in full when
  // verbose). Reset at the start of each (re)build.
  private warnEntries = new Map<string, WarnEntry>();

  constructor(options: LoggerOptions) {
    this.name = options.name;
    this.prefix = options.prefix;
  }

  private format(message: string): string {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }

  // ── level output — normal-logger wording; only the level word is colored ─────

  info(message: string): void {
    console.log(`${color.cyan("info")}  ${this.format(message)}`);
  }

  warn(message: string): void {
    console.warn(`${color.yellow("warn")}  ${this.format(message)}`);
  }

  error(message: string, cause?: Error): void {
    console.error(`${color.red("error")}  ${this.format(message)}`);
    // The underlying cause (a Rollup/esbuild error with its code frame) prints
    // as-is so the stack + frame survive.
    if (cause) console.error(cause);
  }

  // A good outcome is still an ordinary info line, just green.
  success(message: string): void {
    console.log(`${color.green("info")}  ${this.format(message)}`);
  }

  // A step in a multi-phase task reads as a plain info line.
  step(message: string): void {
    this.info(message);
  }

  // `message` is a raw pass-through line with no level word (used to relay
  // content verbatim, e.g. a URL banner line).
  message(message: string): void {
    console.log(this.format(message));
  }

  raw(message: string): void {
    const tag = this.prefix ? `${color.dim(`[${this.prefix}]`)} ` : "";
    console.log(`${tag}${message}`);
  }

  /** A single collapsed line for the non-actionable build warnings. */
  warnSummary(message: string): void {
    this.warn(message);
  }

  /** A file-change notice in the dev loop (e.g. `changed  server/foo.ts`). */
  changed(event: string, file: string): void {
    console.log(`${event}  ${color.dim(file)}`);
  }

  startGroup(title?: string): void {
    console.log("");
    if (title) console.log(color.dim(title));
  }

  endGroup(message?: string): void {
    if (message) console.log(color.dim(message));
    console.log("");
  }

  // ── Build-warning preprocessing ──────────────────────────────────────────
  // This is the single place raw build warnings get classified/deduped, so the
  // dev loop can collapse the noise while still surfacing what the author owns.

  /** Clear the collected warnings — called before each (re)build. */
  resetWarnings(): void {
    this.warnEntries.clear();
  }

  /** Classify + dedupe one raw warning message. */
  collectWarning(raw: string): void {
    const message = raw.replace(ANSI, "").trim();
    if (!message) return;

    const category = classifyWarning(message);
    const sig = warningSignature(message);
    const existing = this.warnEntries.get(sig);
    if (existing) {
      existing.count++;
    } else {
      this.warnEntries.set(sig, { count: 1, category, message });
    }
  }

  /**
   * Print the collected warnings: author-actionable ones always in full, the
   * rest collapsed to a single summary line unless `verbose`.
   */
  flushWarnings(verbose = false): void {
    const entries = [...this.warnEntries.values()];
    const actionable = entries.filter((e) => e.category === "actionable");
    const hidden = entries.filter((e) => e.category !== "actionable");

    for (const e of actionable) {
      this.warn(e.count > 1 ? `${e.message} (×${e.count})` : e.message);
    }

    if (verbose) {
      for (const e of hidden) {
        this.warn(e.count > 1 ? `${e.message} (×${e.count})` : e.message);
      }
      return;
    }

    if (!hidden.length) return;
    const total = hidden.reduce((n, e) => n + e.count, 0);
    const byCategory = new Map<WarnCategory, number>();
    for (const e of hidden) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.count);
    }
    const label = (c: WarnCategory): string => (c === "dependency" ? "dep" : c);
    const breakdown = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${n}× ${label(c)}`)
      .join(" · ");
    const noun = total === 1 ? "warning" : "warnings";
    this.warnSummary(
      `${total} dependency ${noun} hidden (${breakdown})  ·  nrg dev --verbose to show`,
    );
  }

  /** Whether a message is an expected transient (Node-RED down mid-restart). */
  isTransient(message: string): boolean {
    return TRANSIENT_LOG.test(message);
  }

  /**
   * A vite `Logger` that funnels warnings into {@link collectWarning} and drops
   * everything else. Real build *errors* surface via the thrown `BuildError`
   * (with its code frame), so swallowing them here avoids a duplicate copy.
   */
  viteWarnLogger(): ViteLogger {
    const noop = (): void => {};
    return {
      info: noop,
      warn: (msg: string) => this.collectWarning(msg),
      warnOnce: (msg: string) => this.collectWarning(msg),
      error: noop,
      clearScreen: noop,
      hasErrorLogged: () => false,
      hasWarned: false,
    };
  }

  child(prefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({ name: this.name, prefix: newPrefix });
  }
}

// NOTE: global logger is still used by other vite messages
const logger = new Logger({ name: "vite-plugin-nrg" });

export { logger };
