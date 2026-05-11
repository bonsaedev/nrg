import * as clackLogger from "@clack/prompts";
import type { LoggerOptions } from "./types";

const color = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

export class Logger {
  private readonly name: string;
  private readonly prefix?: string;
  private readonly spinner = clackLogger.spinner();

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

  error(message: string, cause?: Error): void {
    clackLogger.log.error(this.format(message));
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

  startSpinner(message: string): void {
    this.spinner.start(this.format(message));
  }

  stopSpinner(message: string): void {
    this.spinner.stop(this.format(message));
  }

  child(prefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger({ name: this.name, prefix: newPrefix });
  }
}

// NOTE: global logger is still used by other vite messages
const logger = new Logger({ name: "vite-plugin-node-red" });

export { logger };
