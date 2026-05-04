import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRED } from "../../../../mocks/red";
import fs from "fs";

describe("initRoutes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("should register the /nrg/assets/* GET route on httpAdmin", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { initRoutes } = await import(
      "../../../../../src/core/server/api/routes"
    );

    const RED = createMockRED();
    initRoutes(RED);

    expect(RED.httpAdmin.get).toHaveBeenCalledWith(
      "/nrg/assets/*",
      expect.any(Function),
    );
  });

  it("should register routes only once", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { initRoutes } = await import(
      "../../../../../src/core/server/api/routes"
    );

    const RED = createMockRED();
    initRoutes(RED);
    initRoutes(RED);

    expect(RED.httpAdmin.get).toHaveBeenCalledTimes(1);
  });
});
