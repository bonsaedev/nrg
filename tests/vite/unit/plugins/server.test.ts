import { describe, it, expect, vi } from "vitest";

// the build orchestrators are never exercised by config(); stub them so the
// module imports cheaply and in isolation
vi.mock("@/vite/server", () => ({ build: vi.fn() }));
vi.mock("@/vite/client", () => ({ build: vi.fn() }));

import { serverPlugin } from "@/vite/plugins/server";
import type { NodeRedLauncher } from "@/vite/types";

function fakeLauncher(over: Partial<NodeRedLauncher> = {}): NodeRedLauncher {
  return {
    start: async () => 1880,
    stop: async () => {},
    cleanup: () => {},
    flushLogs: () => {},
    preferredPort: 1880,
    slug: "",
    basePath: "/",
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
    buildContext: { outDir: "/tmp/out", packageName: "pkg", isDev: true },
  });
  // config() is a synchronous Vite hook returning the partial config
  return (plugin as unknown as { config: () => any }).config();
}

describe("serverPlugin proxy", () => {
  it("scopes the proxy to the slug and targets the preferred port", () => {
    const cfg = pluginConfig(
      fakeLauncher({
        slug: "my-app",
        basePath: "/my-app/",
        preferredPort: 1881,
      }),
    );

    const proxy = cfg.server.proxy;
    const keys = Object.keys(proxy);
    expect(keys).toEqual(["^/my-app(?:/|\\?|$)"]);
    expect(proxy[keys[0]].target).toBe("http://127.0.0.1:1881");
    expect(proxy[keys[0]].ws).toBe(true);
    expect(proxy[keys[0]].changeOrigin).toBe(true);
  });

  it("falls back to a catch-all proxy when there is no slug", () => {
    const cfg = pluginConfig(fakeLauncher({ slug: "", basePath: "/" }));
    expect(Object.keys(cfg.server.proxy)).toEqual(["^/.*"]);
  });

  it("binds the dev server to loopback", () => {
    const cfg = pluginConfig(
      fakeLauncher({ slug: "my-app", basePath: "/my-app/" }),
    );
    expect(cfg.server.host).toBe("127.0.0.1");
  });
});
