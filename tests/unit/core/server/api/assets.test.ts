import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { serveFile } from "@/core/server/api/assets";

function createMockRes() {
  return { setHeader: vi.fn() } as any;
}

describe("serveFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should serve file with correct content type when it exists", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const handler = serveFile("/fake/path/file.js");
    const res = createMockRes();
    const next = vi.fn();

    handler({} as any, res, next);

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

    handler({} as any, res, next);

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

    const { initAssetsRoutes } = await import(
      "@/core/server/api/assets"
    );

    const router = { get: vi.fn() } as any;
    initAssetsRoutes(router);

    expect(router.get).toHaveBeenCalledTimes(3);
    expect(router.get).toHaveBeenCalledWith(
      "/nrg/assets/nrg-client.js",
      expect.any(Function),
    );
    expect(router.get).toHaveBeenCalledWith(
      "/nrg/assets/vue.esm-browser.prod.js",
      expect.any(Function),
    );
    expect(router.get).toHaveBeenCalledWith(
      "/nrg/assets/vue.esm-browser.js",
      expect.any(Function),
    );
  });

  it("should not register routes when resources dir does not exist", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const { initAssetsRoutes } = await import(
      "@/core/server/api/assets"
    );

    const router = { get: vi.fn() } as any;
    initAssetsRoutes(router);

    expect(router.get).not.toHaveBeenCalled();
  });

  it("should resolve vue prod build in production", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const { initAssetsRoutes } = await import(
      "@/core/server/api/assets"
    );

    const router = { get: vi.fn() } as any;
    initAssetsRoutes(router);

    const handler = router.get.mock.calls.find(
      (c: any[]) => c[0] === "/nrg/assets/vue.esm-browser.prod.js",
    )[1];

    handler({}, { setHeader: vi.fn() }, vi.fn());

    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.prod.js"),
    );

    process.env.NODE_ENV = origEnv;
  });

  it("should resolve vue dev build in development", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const { initAssetsRoutes } = await import(
      "@/core/server/api/assets"
    );

    const router = { get: vi.fn() } as any;
    initAssetsRoutes(router);

    const handler = router.get.mock.calls.find(
      (c: any[]) => c[0] === "/nrg/assets/vue.esm-browser.prod.js",
    )[1];

    handler({}, { setHeader: vi.fn() }, vi.fn());

    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.js"),
    );
    expect(fs.createReadStream).not.toHaveBeenCalledWith(
      expect.stringContaining("prod"),
    );

    process.env.NODE_ENV = origEnv;
  });
});
