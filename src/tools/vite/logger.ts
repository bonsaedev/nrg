import * as clackLogger from "@clack/prompts";
import type { Logger as ViteLogger } from "vite";
import type { LoggerOptions } from "./types";

const color = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
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
  private readonly spinner = clackLogger.spinner();
  // Tracks whether `spinner` is mid-run so `error()` can end it with the error
  // glyph instead of leaving it dangling: a running clack spinner traps
  // `unhandledRejection`/`uncaughtException` and prints its own generic
  // "Something went wrong" over the real failure.
  private spinnerActive = false;

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

  intro(message?: string): void {
    clackLogger.intro(message ?? this.name);
  }

  outro(message: string): void {
    clackLogger.outro(this.format(message));
  }

  step(message: string): void {
    clackLogger.log.step(this.format(message));
  }

  success(message: string): void {
    clackLogger.log.success(this.format(message));
  }

  warn(message: string): void {
    clackLogger.log.warn(this.format(message));
  }

  /**
   * A single collapsed line for the non-actionable build warnings (kept inside
   * the clack gutter, dim so it reads as an aside rather than a problem).
   */
  warnSummary(message: string): void {
    console.log(`│  ${color.yellow("⚠")} ${color.dim(message)}`);
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

  /** A file-change notice in the dev loop (e.g. `Changed  server/foo.ts`). */
  changed(event: string, file: string): void {
    console.log(`│`);
    console.log(`◇  ${event}  ${color.dim(file)}`);
  }

  error(message: string, cause?: Error): void {
    const text = this.format(message);
    // If a spinner is running, end it *as* the error (glyph + deregistered
    // traps) rather than printing a separate line and abandoning the spinner —
    // that abandonment is what surfaces the useless "Something went wrong".
    if (this.spinnerActive) {
      this.spinner.error(text);
      this.spinnerActive = false;
    } else {
      clackLogger.log.error(text);
    }
    if (cause) {
      console.error(cause);
    }
  }

  info(message: string): void {
    clackLogger.log.info(this.format(message));
  }

  message(message: string): void {
    clackLogger.log.message(this.format(message));
  }

  raw(message: string): void {
    const prefix = this.prefix ? color.dim(`[${this.prefix}]`) : "";
    console.log(`│  ${prefix} ${message}`);
  }

  startGroup(title?: string): void {
    if (title) {
      console.log(`│`);
      console.log(`├─ ${color.cyan(title)}`);
    }
    console.log(`│`);
  }

  endGroup(message?: string): void {
    console.log(`│`);
    console.log(`└─ ${message ?? "Done"}`);
    console.log();
  }

  // clack animates the spinner frame-by-frame, which is great in a real terminal
  // but spews one line per frame when stdout is piped/redirected (CI, `> log`).
  // Only spin when interactive; otherwise print a single static line.
  private get interactive(): boolean {
    return Boolean(process.stdout.isTTY);
  }

  startSpinner(message: string): void {
    if (this.interactive) {
      this.spinner.start(this.format(message));
      this.spinnerActive = true;
    } else {
      console.log(`◒  ${this.format(message)}`);
    }
  }

  stopSpinner(message?: string): void {
    if (this.spinnerActive) {
      // Clack's spinner.stop() ALWAYS paints a final frame; with no message it
      // leaves a bare, textless glyph (◇), so callers should pass a message.
      if (message !== undefined) {
        this.spinner.stop(this.format(message));
      } else {
        this.spinner.stop();
      }
      this.spinnerActive = false;
    } else if (message !== undefined) {
      console.log(`◇  ${this.format(message)}`);
    }
  }

  /** Update the running spinner's text (interactive only; no-op otherwise). */
  updateSpinner(message: string): void {
    if (this.interactive && this.spinnerActive) {
      this.spinner.message(this.format(message));
    }
  }

  child(prefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({ name: this.name, prefix: newPrefix });
  }
}

// NOTE: global logger is still used by other vite messages
const logger = new Logger({ name: "vite-plugin-nrg" });

export { logger };
