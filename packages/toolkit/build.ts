import { execSync } from "child_process";
import {
  mkdirSync,
  copyFileSync,
  cpSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";
import {
  DTS_FLAGS,
  esbuildBundle,
  clean,
  writePublishManifest,
} from "../../scripts/build-lib";

// Runs with cwd = packages/toolkit (pnpm --filter @bonsae/nrg build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const WORKSPACE_ROOT = path.resolve(ROOT, "../..");
const DIST = path.resolve(ROOT, "dist");

function buildRootEntry() {
  esbuildBundle("src/index.ts", { outfile: "dist/index.js" });
  console.log("✓ Built root entry → dist/index.js");
}

function buildVitePlugin() {
  esbuildBundle("src/vite/index.ts", { outdir: "dist/vite" });
  console.log("✓ Built vite plugin → dist/vite/");
}

async function buildTestUtils() {
  esbuildBundle("src/test/server/unit/index.ts", {
    outdir: "dist/test/server/unit",
  });
  esbuildBundle("src/test/server/unit/config.ts", {
    outdir: "dist/test/server/unit",
  });
  esbuildBundle("src/test/server/integration/index.ts", {
    outdir: "dist/test/server/integration",
  });
  esbuildBundle("src/test/server/integration/config.ts", {
    outdir: "dist/test/server/integration",
  });
  // index.ts/setup.ts pull in Vue-touching modules — use vite with the vue
  // plugin. All bare imports are external (consumers resolve them).
  await viteBuild({
    configFile: false,
    logLevel: "warn",
    plugins: [vue()],
    build: {
      outDir: path.join(DIST, "test/client/component"),
      emptyOutDir: false,
      lib: {
        entry: {
          index: path.resolve(ROOT, "src/test/client/component/index.ts"),
          setup: path.resolve(ROOT, "src/test/client/component/setup.ts"),
        },
        formats: ["es"],
      },
      rollupOptions: {
        external: (id) => !id.startsWith(".") && !path.isAbsolute(id),
      },
    },
  });
  esbuildBundle("src/test/client/component/config.ts", {
    outdir: "dist/test/client/component",
  });
  esbuildBundle("src/test/client/unit/index.ts", {
    outdir: "dist/test/client/unit",
  });
  esbuildBundle("src/test/client/unit/config.ts", {
    outdir: "dist/test/client/unit",
  });
  esbuildBundle("src/test/client/unit/setup.ts", {
    outdir: "dist/test/client/unit",
  });
  esbuildBundle("src/test/client/e2e/index.ts", {
    outdir: "dist/test/client/e2e",
  });
  esbuildBundle("src/test/client/e2e/config.ts", {
    outdir: "dist/test/client/e2e",
  });
  console.log("✓ Built test utilities → dist/test/");
}

function writeReExports() {
  // ./server and ./client re-export the runtime — single source of truth.
  mkdirSync(path.join(DIST, "server"), { recursive: true });
  writeFileSync(
    path.join(DIST, "server/index.cjs"),
    `'use strict';\nmodule.exports = require("@bonsae/nrg-runtime/server");\n`,
  );
  mkdirSync(path.join(DIST, "types"), { recursive: true });
  writeFileSync(
    path.join(DIST, "types/server.d.ts"),
    `export * from "@bonsae/nrg-runtime/server";\n`,
  );
  writeFileSync(
    path.join(DIST, "types/client.d.ts"),
    `export * from "@bonsae/nrg-runtime/client";\n`,
  );
  console.log("✓ Wrote server/client re-exports → dist/");
}

function generateTypes() {
  execSync(
    `npx dts-bundle-generator -o dist/types/index.d.ts src/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );

  execSync(
    `npx dts-bundle-generator -o dist/types/vite.d.ts src/vite/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  appendFileSync(
    "dist/types/vite.d.ts",
    `
import type { Plugin } from "vite";
export declare function nrg(options?: NrgPluginOptions): Plugin[];
`,
  );

  execSync(
    `npx dts-bundle-generator -o dist/types/test-server-unit.d.ts src/test/server/unit/index.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/types/test-server-integration.d.ts src/test/server/integration/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/types/test-client-component.d.ts src/test/client/component/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/types/test-client-unit.d.ts src/test/client/unit/index.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/types/test-client-e2e.d.ts src/test/client/e2e/index.ts ${DTS_FLAGS} --external-imports playwright --external-imports playwright-core`,
    { stdio: "inherit" },
  );

  console.log("✓ Generated type declarations → dist/types/");
}

function copyShims() {
  // tsconfig/core/client.json and tsconfig/test/client/component.json
  // force-include the client type shims via relative `files` paths
  // (../../types/shims/*). Post-split those shims are generated in the runtime
  // package, so copy the whole tree into the toolkit's published dist to keep
  // those paths resolvable for consumers (they are not module-resolved).
  const shimsSrc = path.resolve(
    WORKSPACE_ROOT,
    "packages/runtime/dist/types/shims",
  );
  if (!existsSync(shimsSrc)) {
    throw new Error(
      `Runtime shims not found at ${shimsSrc} — build @bonsae/nrg-runtime first.`,
    );
  }
  cpSync(shimsSrc, path.join(DIST, "types/shims"), { recursive: true });
  console.log("✓ Copied client type shims → dist/types/shims/");
}

function copyAssets() {
  mkdirSync("dist/tsconfig", { recursive: true });
  cpSync("src/tsconfig", "dist/tsconfig", { recursive: true });
  cpSync("src/schemas", "dist/schemas", { recursive: true });

  // The package publishes from dist/ (publishConfig.directory), so README and
  // LICENSE (the project-level files) go into dist/.
  for (const f of ["README.md", "LICENSE"]) {
    const src = path.join(WORKSPACE_ROOT, f);
    if (existsSync(src)) copyFileSync(src, path.join(DIST, f));
  }
  console.log("✓ Copied tsconfigs, schemas, README, and LICENSE → dist/");
}

async function main() {
  clean(DIST);
  buildRootEntry();
  buildVitePlugin();
  await buildTestUtils();
  writeReExports();
  generateTypes();
  copyAssets();
  copyShims();
  writePublishManifest(ROOT, DIST);
  console.log("✓ @bonsae/nrg (toolkit) built");
}

main();
