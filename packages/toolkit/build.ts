import { execSync } from "child_process";
import {
  mkdirSync,
  copyFileSync,
  cpSync,
  readFileSync,
  readdirSync,
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
  minifyFile,
  clean,
  writePublishManifest,
} from "../../scripts/build-lib";

// Runs with cwd = packages/toolkit (pnpm --filter @bonsae/nrg build).
//
// This single build emits BOTH published packages:
//   - @bonsae/nrg         (the toolkit) → packages/toolkit/dist
//   - @bonsae/nrg-runtime (the light artifact for deployed nodes) → a copied
//     subset of the toolkit's core output, dropped into packages/runtime/dist
//
// The runtime is no longer a source package: packages/runtime keeps only its
// publish manifest (package.json) + README, and its dist is emitted here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const WORKSPACE_ROOT = path.resolve(ROOT, "../..");
const DIST = path.resolve(ROOT, "dist");
const RUNTIME_ROOT = path.resolve(WORKSPACE_ROOT, "packages/runtime");
const RUNTIME_DIST = path.resolve(RUNTIME_ROOT, "dist");

// ---------------------------------------------------------------------------
// Toolkit entries (the @bonsae/nrg surface: index, vite plugin, test utils)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core build (shared by both packages: server VALUES + editor client asset)
// ---------------------------------------------------------------------------

function buildCoreServer() {
  // The core server, as a self-contained CJS bundle with external deps. This is
  // the runtime VALUES served at ./server. It replaces the old re-export to
  // @bonsae/nrg-runtime — the toolkit now owns this bundle, and the runtime
  // artifact ships the very same bytes (deps are external, so identical for
  // both packages).
  esbuildBundle("src/core/server/index.ts", {
    format: "cjs",
    outfile: "dist/server/index.cjs",
  });
  console.log("✓ Built core server → dist/server/index.cjs");
}

async function buildClientAsset() {
  // ESM-only plugin — dynamic import resolves it under tsx in this package.
  const { default: cssInjectedByJsPlugin } =
    await import("vite-plugin-css-injected-by-js");
  // The editor client runtime, served as a static asset (in dev, by the
  // toolkit); vue is externalized to the URL the editor loads it from.
  await viteBuild({
    configFile: false,
    logLevel: "warn",
    plugins: [vue(), cssInjectedByJsPlugin()],
    build: {
      outDir: path.join(DIST, "server/resources"),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(ROOT, "src/core/client/index.ts"),
        name: "NrgClient",
        // Force .js (not .mjs) — this is a static asset the editor loads from a
        // URL; the toolkit being type:module would otherwise make vite emit
        // .mjs for the ES bundle.
        fileName: () => "nrg-client.js",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["vue"],
        output: { paths: { vue: "/nrg/assets/vue.esm-browser.prod.js" } },
      },
    },
  });
  // Vite leaves a newline between every concatenated module (~270KB over
  // thousands of lines); a final esbuild pass collapses the whitespace to
  // ~190KB without disturbing the externalized `vue` import.
  minifyFile(path.join(DIST, "server/resources/nrg-client.js"));
  console.log("✓ Built client asset → dist/server/resources/nrg-client.js");
}

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

function generateTypes() {
  // ----- toolkit-owned surface (index, vite, test-*) -----
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

  // ----- core surface (server + client), natively owned & generated here -----
  // These were previously copied from packages/runtime/dist; the toolkit now
  // owns the core source (src/core/*) so it generates them directly. Consumers
  // resolve every nrg type *here* (the ESM toolkit), never through the
  // transitive CJS runtime — that boundary splits TypeBox into nominally
  // incompatible cjs/esm `TObject` builds.
  execSync(
    `npx dts-bundle-generator -o dist/types/server.d.ts src/core/server/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  const serverDts = readFileSync("dist/types/server.d.ts", "utf-8");
  writeFileSync(
    "dist/types/server.d.ts",
    `/// <reference path="./shims/typebox.d.ts" />\n${serverDts}`,
  );

  execSync(
    `npx dts-bundle-generator -o dist/types/client.d.ts src/core/client/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  appendFileSync(
    "dist/types/client.d.ts",
    `
export declare function defineNode<T extends NodeDefinition>(options: T): T;
export declare function registerType(definition: NodeDefinition): Promise<void>;
export declare function registerTypes(nodes: NodeDefinition[]): Promise<void>;
export declare function useFormNode<TConfig extends TSchema = TSchema, TCredentials extends TSchema = TSchema>(): {
  node: NodeRedNode & Infer<TConfig> & { credentials: Infer<TCredentials> & Record<string, any> };
  schema: Record<string, any>;
  errors: Record<string, string>;
};
`,
  );

  console.log("✓ Generated type declarations → dist/types/");
}

function copyShims() {
  mkdirSync("dist/types/shims/client", { recursive: true });
  copyFileSync(
    "src/core/client/shims-vue.d.ts",
    "dist/types/shims/shims-vue.d.ts",
  );
  copyFileSync(
    "src/core/client/globals.d.ts",
    "dist/types/shims/client/globals.d.ts",
  );
  copyFileSync("src/core/server/typebox.d.ts", "dist/types/shims/typebox.d.ts");
  copyFileSync(
    "src/core/schema-options.ts",
    "dist/types/shims/schema-options.d.ts",
  );
  console.log("✓ Copied core shims → dist/types/shims/");
}

function generateComponentTypes() {
  execSync("npx vue-tsc -p tsconfig.vue-dts.json", { stdio: "inherit" });

  // vue-tsc mirrors the src-relative path under outDir, and the .vue files now
  // live at src/core/client/form/components/*.vue, so the emitted declarations
  // land under shims/core/client/form/components/.
  const componentsDir = "dist/types/shims/core/client/form/components";
  const vueFiles = readdirSync(componentsDir).filter((f) =>
    f.endsWith(".vue.d.ts"),
  );
  for (const file of vueFiles) {
    const filePath = path.join(componentsDir, file);
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(
      /declare const _default: typeof __VLS_export;\s*export default _default;\s*declare const __VLS_export:\s*([\s\S]+)$/,
    );
    if (!match) {
      throw new Error(
        `Unexpected vue-tsc declaration shape in ${filePath} — update generateComponentTypes()`,
      );
    }
    const preamble = content.slice(0, match.index);
    const actualType = match[1].trimEnd().replace(/;$/, "");
    writeFileSync(
      filePath,
      `${preamble}declare const _default: ${actualType};\nexport default _default;\n`,
    );
  }

  const entries = vueFiles.map((file) => {
    const baseName = file.replace(".vue.d.ts", "");
    const componentName = baseName
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    return `    ${componentName}: (typeof import("./core/client/form/components/${baseName}.vue"))["default"];`;
  });

  writeFileSync(
    "dist/types/shims/components.d.ts",
    `/**
 * Global component type declarations for Volar / Vue Language Server.
 * Auto-generated during build — do not edit manually.
 */

export {};

declare module "vue" {
  export interface ComponentCustomProperties {
    $i18n: (label: string) => string;
  }

  export interface GlobalComponents {
${entries.join("\n")}
  }
}
`,
  );
  console.log("✓ Generated component type declarations → dist/types/shims/");
}

// ---------------------------------------------------------------------------
// Toolkit assets (tsconfig + schemas + README/LICENSE)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Runtime artifact (the @bonsae/nrg-runtime publishable package)
// ---------------------------------------------------------------------------

function emitRuntimeArtifact() {
  // The runtime is the light subset of the toolkit's core output: the server
  // VALUES bundle, the editor client asset, and the core type declarations +
  // shims. The server.cjs is self-contained (external deps), so the same bytes
  // are valid for both packages. NOTHING from internal/* ships here — the
  // runtime has no test-support surface.
  clean(RUNTIME_DIST);
  mkdirSync(path.join(RUNTIME_DIST, "server"), { recursive: true });
  mkdirSync(path.join(RUNTIME_DIST, "types"), { recursive: true });

  copyFileSync(
    path.join(DIST, "server/index.cjs"),
    path.join(RUNTIME_DIST, "server/index.cjs"),
  );
  cpSync(
    path.join(DIST, "server/resources"),
    path.join(RUNTIME_DIST, "server/resources"),
    { recursive: true },
  );
  copyFileSync(
    path.join(DIST, "types/server.d.ts"),
    path.join(RUNTIME_DIST, "types/server.d.ts"),
  );
  copyFileSync(
    path.join(DIST, "types/client.d.ts"),
    path.join(RUNTIME_DIST, "types/client.d.ts"),
  );
  cpSync(
    path.join(DIST, "types/shims"),
    path.join(RUNTIME_DIST, "types/shims"),
    { recursive: true },
  );

  // The runtime publishes from dist/ (publishConfig.directory="dist"), so its
  // publish manifest, README, and LICENSE go into dist/. The manifest is
  // derived from packages/runtime/package.json (light deps only).
  writePublishManifest(RUNTIME_ROOT, RUNTIME_DIST);
  const runtimeReadme = path.join(RUNTIME_ROOT, "README.md");
  copyFileSync(
    existsSync(runtimeReadme)
      ? runtimeReadme
      : path.join(WORKSPACE_ROOT, "README.md"),
    path.join(RUNTIME_DIST, "README.md"),
  );
  const license = path.join(WORKSPACE_ROOT, "LICENSE");
  if (existsSync(license))
    copyFileSync(license, path.join(RUNTIME_DIST, "LICENSE"));

  console.log("✓ Emitted @bonsae/nrg-runtime artifact → packages/runtime/dist");
}

// ---------------------------------------------------------------------------

async function main() {
  clean(DIST);
  // Toolkit surface.
  buildRootEntry();
  buildVitePlugin();
  await buildTestUtils();
  // Core (shared) values: server CJS + editor client asset.
  buildCoreServer();
  await buildClientAsset();
  // Types (toolkit surface + natively-owned core surface) + shims + components.
  generateTypes();
  copyShims();
  generateComponentTypes();
  // Toolkit assets + publish manifest.
  copyAssets();
  writePublishManifest(ROOT, DIST);
  console.log("✓ @bonsae/nrg (toolkit) built");
  // Emit the second published package from the core subset.
  emitRuntimeArtifact();
  console.log("✓ @bonsae/nrg-runtime artifact emitted");
}

main();
