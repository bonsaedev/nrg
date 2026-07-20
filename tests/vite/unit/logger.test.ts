import { describe, it, expect, vi } from "vitest";
import { Logger, logger } from "@/tools/vite/logger";

// The Logger is now a thin plain-console wrapper (no @clack/prompts): normal
// level wording, color only via NO_COLOR-gated ANSI, no spinner or box gutter.
// The level methods are trivial console calls; these cover the parts with real
// logic — the prefix tag on raw lines and the group markers.
describe("Logger", () => {
  it("raw() tags the line with the prefix when one is set", () => {
    const log = new Logger({ name: "test", prefix: "pfx" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.raw("raw message");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("pfx"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("raw message"));
    spy.mockRestore();
  });

  it("raw() has no prefix tag when none is set", () => {
    const log = new Logger({ name: "test" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.raw("plain message");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("plain message"));
    spy.mockRestore();
  });

  it("startGroup() prints the title", () => {
    const log = new Logger({ name: "test" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.startGroup("Group Title");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Group Title"));
    spy.mockRestore();
  });

  it("endGroup() prints the closing message", () => {
    const log = new Logger({ name: "test" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.endGroup("Finished");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Finished"));
    spy.mockRestore();
  });

  it("exports a singleton logger instance", () => {
    expect(logger).toBeInstanceOf(Logger);
  });
});
