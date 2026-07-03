import { describe, it, expect, vi } from "vitest";

// the build orchestrators are never exercised by config(); stub them so the
// module imports cheaply and in isolation
vi.mock("@/tools/vite/server", () => ({ build: vi.fn() }));
vi.mock("@/tools/vite/client", () => ({ build: vi.fn() }));

import { serverPlugin } from "@/tools/vite/lifecycle/server";
import type { NodeRedLauncher } from "@/tools/vite/types";

function fakeLauncher(over: Partial<NodeRedLauncher> = {}): NodeRedLauncher {
  return {
    start: async () => 1880,
    stop: async () => {},
    cleanup: () => {},
    flushLogs: () => {},
    preferredPort: 1880,
    restartDelay: 1000,
    pid: null,
    ...over,
  };
}

function pluginConfig(launcher: NodeRedLauncher) {
  const plugin = serverPlugin({
    nodeRedLauncher: launcher,
    serverBuildOptions: {},
    clientBuildOptions: {},
    extraFilesCopyTargets: [],
    buildContext: {
      outDir: "/tmp/out",
      packageName: "pkg",
      isDev: true,
      resourcesDir: "/tmp/resources",
    },
  });
  // config() is a synchronous Vite hook returning the partial config
  return (plugin as unknown as { config: () => any }).config();
}

describe("serverPlugin proxy", () => {
  it("proxies everything to the preferred Node-RED port", () => {
    const cfg = pluginConfig(fakeLauncher({ preferredPort: 1881 }));

    const proxy = cfg.server.proxy;
    expect(Object.keys(proxy)).toEqual(["^/.*"]);
    expect(proxy["^/.*"].target).toBe("http://127.0.0.1:1881");
    expect(proxy["^/.*"].ws).toBe(true);
    expect(proxy["^/.*"].changeOrigin).toBe(true);
  });

  it("binds the dev server to loopback", () => {
    const cfg = pluginConfig(fakeLauncher());
    expect(cfg.server.host).toBe("127.0.0.1");
  });
});
