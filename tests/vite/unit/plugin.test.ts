import { describe, it, expect, vi } from "vitest";

// plugin.ts pulls in the build orchestrators transitively; stub them so the
// module imports cheaply (we only exercise the pure resolveIsDev helper).
vi.mock("@/tools/vite/server", () => ({ build: vi.fn() }));
vi.mock("@/tools/vite/client", () => ({ build: vi.fn() }));

import { resolveIsDev } from "@/tools/vite/plugin";

describe("resolveIsDev", () => {
  // `pnpm dev` is the only dev path: the dev server (serve) builds to .nrg and
  // imports the toolkit. Mode is irrelevant — @bonsae/nrg-runtime is never
  // installed in a dev tree, so any serve run is dev.
  it("treats any dev server (serve) as dev", () => {
    expect(resolveIsDev({ command: "serve" })).toBe(true);
  });

  // Every `vite build` (any --mode) produces the publishable ./dist artifact
  // whose import is rewritten to @bonsae/nrg-runtime; `pnpm preview` later runs
  // that artifact (aliasing the runtime to the toolkit so it boots locally).
  it("treats any build (publish) as NOT dev", () => {
    expect(resolveIsDev({ command: "build" })).toBe(false);
  });
});
