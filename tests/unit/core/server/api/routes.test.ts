import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNodeRedRuntime } from "../../../../mocks/red";
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

    const RED = createNodeRedRuntime();
    initRoutes(RED);

    expect(RED.httpAdmin.get).toHaveBeenCalledWith(
      "/nrg/assets/nrg-client.js",
      expect.any(Function),
    );
    expect(RED.httpAdmin.get).toHaveBeenCalledWith(
      "/nrg/assets/vue.esm-browser.prod.js",
      expect.any(Function),
    );
    expect(RED.httpAdmin.get).toHaveBeenCalledWith(
      "/nrg/assets/vue.esm-browser.js",
      expect.any(Function),
    );
  });

  it("should register routes only once", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { initRoutes } = await import(
      "../../../../../src/core/server/api/routes"
    );

    const RED = createNodeRedRuntime();
    initRoutes(RED);
    initRoutes(RED);

    expect(RED.httpAdmin.get).toHaveBeenCalledTimes(3);
  });
});
