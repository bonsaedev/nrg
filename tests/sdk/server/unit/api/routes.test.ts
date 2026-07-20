import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRED } from "@mocks/red";
import fs from "fs";

describe("initRoutes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("should register the /nrg/assets/* GET route on httpAdmin", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { initRoutes } = await import("@/sdk/lib/server/api/routes");

    const RED = createRED();
    initRoutes(RED);

    expect(RED.httpAdmin.get).toHaveBeenCalledWith(
      "/nrg/assets/nrg.js",
      expect.any(Function),
    );
    expect(RED.httpAdmin.get).toHaveBeenCalledWith(
      "/nrg/assets/vue.js",
      expect.any(Function),
    );
  });

  it("should register routes only once", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { initRoutes } = await import("@/sdk/lib/server/api/routes");

    const RED = createRED();
    initRoutes(RED);
    initRoutes(RED);

    expect(RED.httpAdmin.get).toHaveBeenCalledTimes(2);
  });
});
