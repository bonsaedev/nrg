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
  // Node-context globalSetup (no Vue) that serializes node schemas for the
  // browser component tests. Bundled standalone like config.ts.
  esbuildBundle("src/test/client/component/schemas.ts", {
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
  // ./server re-exports the runtime VALUES at run time. The TYPES are owned by
  // the toolkit (copyRuntimeTypes) so consumers never resolve nrg types through
  // the transitive CJS runtime — that boundary splits TypeBox into nominally
  // incompatible cjs/esm `TObject` builds. (./client is types-only.)
  mkdirSync(path.join(DIST, "server"), { recursive: true });
  writeFileSync(
    path.join(DIST, "server/index.cjs"),
    `'use strict';\nmodule.exports = require("@bonsae/nrg-runtime/server");\n`,
  );
  console.log("✓ Wrote server value re-export → dist/server/index.cjs");
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
    `npx dts-bundle-generator -o dist/types/test-client-component-schemas.d.ts src/test/client/component/schemas.ts ${DTS_FLAGS} --external-types vitest`,
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

function copyRuntimeTypes() {
  // The toolkit is the single publisher of nrg types. The runtime emits its
  // .d.ts (self-contained: only bare imports + a ./shims/typebox.d.ts ref), and
  // we copy server/client/shims into the toolkit's own (ESM) dist so consumers
  // resolve every nrg type *here* — never through the transitive CJS runtime,
  // which would resolve TypeBox to a different (cjs) `TObject` build than the
  // ESM toolkit harness and break `createNode()` typechecks. Runtime VALUES are
  // still re-exported from @bonsae/nrg-runtime at run time (writeReExports).
  const runtimeTypes = path.resolve(
    WORKSPACE_ROOT,
    "packages/runtime/dist/types",
  );
  if (!existsSync(path.join(runtimeTypes, "shims"))) {
    throw new Error(
      `Runtime types not found at ${runtimeTypes} — build @bonsae/nrg-runtime first.`,
    );
  }
  mkdirSync(path.join(DIST, "types"), { recursive: true });
  cpSync(path.join(runtimeTypes, "shims"), path.join(DIST, "types/shims"), {
    recursive: true,
  });
  copyFileSync(
    path.join(runtimeTypes, "server.d.ts"),
    path.join(DIST, "types/server.d.ts"),
  );
  copyFileSync(
    path.join(runtimeTypes, "client.d.ts"),
    path.join(DIST, "types/client.d.ts"),
  );
  console.log("✓ Copied runtime types (server, client, shims) → dist/types/");
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
  copyRuntimeTypes();
  writePublishManifest(ROOT, DIST);
  console.log("✓ @bonsae/nrg (toolkit) built");
}

main();
