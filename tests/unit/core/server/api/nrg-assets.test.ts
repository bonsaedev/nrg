import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { handleNrgAsset } from "../../../../../src/core/server/api/nrg-assets";

function createMockReq(fileName: string) {
  return { params: [fileName] } as any;
}

function createMockRes() {
  const res: any = {
    setHeader: vi.fn(),
  };
  return res;
}

describe("handleNrgAsset", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should call next for files not in the allowed list", () => {
    const req = createMockReq("malicious.sh");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("should call next for path traversal attempts", () => {
    const req = createMockReq("../../../etc/passwd");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should call next when allowed file does not exist on disk", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const req = createMockReq("nrg-client.js");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should serve nrg-client.js with correct content type", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const req = createMockReq("nrg-client.js");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/javascript",
    );
    expect(mockStream.pipe).toHaveBeenCalledWith(res);
  });

  it("should serve vue.esm-browser.prod.js in production", () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const req = createMockReq("vue.esm-browser.prod.js");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.prod.js"),
    );

    process.env.NODE_ENV = origEnv;
  });

  it("should swap vue prod for dev build in development", () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const req = createMockReq("vue.esm-browser.prod.js");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.js"),
    );
    expect(fs.createReadStream).not.toHaveBeenCalledWith(
      expect.stringContaining("prod"),
    );

    process.env.NODE_ENV = origEnv;
  });

  it("should serve vue.esm-browser.js directly", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const mockStream = { pipe: vi.fn() };
    vi.spyOn(fs, "createReadStream").mockReturnValue(mockStream as any);

    const req = createMockReq("vue.esm-browser.js");
    const res = createMockRes();
    const next = vi.fn();

    handleNrgAsset(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("vue.esm-browser.js"),
    );
  });
});
