import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express, Request, Response } from "express";
import fs from "fs";
import { serveFile } from "@/sdk/lib/server/api/assets";

function createMockRes() {
  return { setHeader: vi.fn() } as unknown as Response & {
    setHeader: ReturnType<typeof vi.fn>;
  };
}

function createMockRouter() {
  return { get: vi.fn() } as unknown as Express & {
    get: ReturnType<typeof vi.fn>;
  };
}

describe("serveFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should serve file with correct content type when it exists", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(
      mockStream as unknown as fs.ReadStream,
    );

    const handler = serveFile("/fake/path/file.js");
    const res = createMockRes();
    const next = vi.fn();

    handler({} as unknown as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/javascript",
    );
    expect(fs.createReadStream).toHaveBeenCalledWith("/fake/path/file.js");
    expect(mockStream.pipe).toHaveBeenCalledWith(res);
  });

  it("should call next when file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const handler = serveFile("/fake/path/missing.js");
    const res = createMockRes();
    const next = vi.fn();

    handler({} as unknown as Request, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe("initAssetsRoutes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("should register three explicit asset routes", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { initAssetsRoutes } = await import("@/sdk/lib/server/api/assets");

    const router = createMockRouter();
    initAssetsRoutes(router);

    // The client asset route + a SINGLE vue route (no dead second variant).
    expect(router.get).toHaveBeenCalledTimes(2);
    // Un-bundled (this source runs from src, not the built bundle), so the
    // __NRG_CLIENT_ASSET__ define is absent and the route uses the unhashed dev
    // fallback. The build injects the content-hashed "nrg.<hash>.js" filename.
    expect(router.get).toHaveBeenCalledWith(
      "/nrg/assets/nrg.js",
      expect.any(Function),
    );
    expect(router.get).toHaveBeenCalledWith(
      "/nrg/assets/vue.js",
      expect.any(Function),
    );
  });

  it("should not register routes when resources dir does not exist", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const { initAssetsRoutes } = await import("@/sdk/lib/server/api/assets");

    const router = createMockRouter();
    initAssetsRoutes(router);

    expect(router.get).not.toHaveBeenCalled();
  });

  it("should resolve vue prod build in production with correct headers", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(
      mockStream as unknown as fs.ReadStream,
    );

    const { initAssetsRoutes } = await import("@/sdk/lib/server/api/assets");

    const router = createMockRouter();
    initAssetsRoutes(router);

    const handler = router.get.mock.calls.find(
      (c: unknown[]) => c[0] === "/nrg/assets/vue.js",
    )![1] as Function;

    const res = createMockRes();
    handler({}, res, vi.fn());

    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.prod.js"),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/javascript",
    );

    process.env.NODE_ENV = origEnv;
  });

  it("should resolve vue dev build in development with correct headers", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(
      mockStream as unknown as fs.ReadStream,
    );

    const { initAssetsRoutes } = await import("@/sdk/lib/server/api/assets");

    const router = createMockRouter();
    initAssetsRoutes(router);

    const handler = router.get.mock.calls.find(
      (c: unknown[]) => c[0] === "/nrg/assets/vue.js",
    )![1] as Function;

    const res = createMockRes();
    handler({}, res, vi.fn());

    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.js"),
    );
    expect(fs.createReadStream).not.toHaveBeenCalledWith(
      expect.stringContaining("prod"),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/javascript",
    );

    process.env.NODE_ENV = origEnv;
  });
});
