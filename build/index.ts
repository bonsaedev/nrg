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
  rmSync,
} from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

// This script lives at build/index.ts and runs with cwd = the repo root
// (pnpm build → tsx build/index.ts). One build emits BOTH published packages
// under dist/:
//   - @bonsae/nrg         (the toolkit)               → dist/toolkit
//   - @bonsae/nrg-runtime (light artifact for nodes)  → dist/runtime
//
// The runtime is NOT a source package: its publishable contents are a copied
// subset of the toolkit's core output (server VALUES + editor client asset),
// plus a manifest generated from the root package.json and the dep list in
// build/runtime/dependencies. It ships no types and no test-support surface.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is build/, so the repo root is one level up. Relative paths below
// (esbuild outdirs, dts -o, tsconfig.dts.json) stay cwd-relative — pnpm runs
// this script from the repo root.
const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist/toolkit");
const RUNTIME_DIST = path.resolve(ROOT, "dist/runtime");
const RUNTIME_SRC = path.resolve(ROOT, "build/runtime");

// ---------------------------------------------------------------------------
// Build helpers (formerly scripts/build-lib.ts; inlined now that this build
// is their only caller).
// ---------------------------------------------------------------------------

/** dts-bundle-generator flags; resolves tsconfig.dts.json next to this build. */
const DTS_FLAGS =
  "--no-check --project tsconfig.dts.json --export-referenced-types=false";

/** Bundle one entry with esbuild (bundled, deps external, node platform). */
function esbuildBundle(
  entry: string,
  {
    format = "esm",
    outfile,
    outdir,
    external = [],
  }: {
    format?: string;
    outfile?: string;
    outdir?: string;
    // Force-external specifiers that a tsconfig `paths` map would otherwise
    // make esbuild resolve to source and inline. `--packages=external` only
    // covers BARE specifiers, so `@bonsae/nrg/server` (mapped to src for tsc)
    // gets inlined without this — duplicating Node/registerTypes and breaking
    // the consumer's `instanceof Node` at registration. assertEsmTestBundles()
    // re-checks this invariant on every build.
    external?: string[];
  },
): void {
  const out = outfile ? `--outfile=${outfile}` : `--outdir=${outdir}`;
  const flags = [
    "--bundle",
    "--packages=external",
    `--format=${format}`,
    "--platform=node",
    ...external.map((e) => `--external:${e}`),
    out,
  ];
  execSync(`esbuild ${entry} ${flags.join(" ")}`, { stdio: "inherit" });
}

/**
 * Post-build invariant guard for the published server test bundles. They are
 * ESM and must NOT inline core-server VALUES: a regression here ships broken to
 * consumers (Node's strict native ESM resolver) yet is invisible in-repo, where
 * source is a single identity and the source-aliased tests run fine. We hit
 * this class three times in 0.26.x — an extensionless `ajv/dist/compile/rules`
 * import, an ESM-undefined `__dirname` from inlined assets.ts, and a duplicated
 * `Node`/registerTypes identity that broke `instanceof Node` at registration.
 * This deterministic, dependency-free check fails the build the instant any of
 * them reappears (e.g. someone drops the integration entry's `external`).
 */
function assertEsmTestBundles(): void {
  const entries = [
    "test/server/unit/index.js",
    "test/server/unit/config.js",
    "test/server/integration/index.js",
    "test/server/integration/config.js",
  ];
  const problems: string[] = [];
  const deepImport =
    /\bfrom\s+"([a-z@][^"]*\/(?:dist|lib|build|cjs|esm|src)\/[^"]*)"/g;
  for (const rel of entries) {
    const code = readFileSync(path.join(DIST, rel), "utf-8");
    // (1) No CJS globals in an ESM bundle (the inlined-assets.ts __dirname bug).
    if (/\b__dirname\b/.test(code) || /\b__filename\b/.test(code)) {
      problems.push(`${rel}: references __dirname/__filename in an ESM bundle`);
    }
    // (2) Deep package imports must carry a file extension — Node's native ESM
    //     resolver won't resolve a bare "pkg/dist/x" not in the package exports.
    for (const m of code.matchAll(deepImport)) {
      if (!/\.(js|cjs|mjs|json)$/.test(m[1])) {
        problems.push(`${rel}: extensionless deep import "${m[1]}"`);
      }
    }
  }
  // (3) The integration entry must keep @bonsae/nrg/server external and inline
  //     no core-server values (the 0.26.2 instanceof-Node regression).
  const integ = readFileSync(
    path.join(DIST, "test/server/integration/index.js"),
    "utf-8",
  );
  if (!/\bfrom\s+"@bonsae\/nrg\/server"/.test(integ)) {
    problems.push(
      "test/server/integration/index.js: @bonsae/nrg/server is not external (core server inlined → duplicate Node identity)",
    );
  }
  for (const marker of ["initValidator", "initRoutes"]) {
    if (integ.includes(marker)) {
      problems.push(
        `test/server/integration/index.js: inlines core-server "${marker}" (must resolve via the external @bonsae/nrg/server)`,
      );
    }
  }
  if (problems.length) {
    throw new Error(
      "ESM test-bundle invariant violated:\n  - " + problems.join("\n  - "),
    );
  }
  console.log("✓ Verified server test bundles stay ESM-clean & externalized");
}

/**
 * Collapse an already-built bundle with a final esbuild minify pass, in place.
 * No `--bundle`, so external imports (e.g. a URL-pathed `vue`) are untouched.
 */
function minifyFile(file: string, format = "esm"): void {
  execSync(
    `esbuild ${file} --minify --format=${format} --allow-overwrite --outfile=${file}`,
    { stdio: "inherit" },
  );
}

/** Remove a directory if present. */
function clean(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  console.log(`✓ Cleaned ${path.relative(ROOT, dir) || "."}`);
}

/**
 * Write the toolkit's publish manifest into dist/toolkit. With
 * `publishConfig.directory: "dist/toolkit"`, the published package is that
 * directory's contents at the package root — so strip the `./dist/toolkit/`
 * prefix from export paths and drop dev-only fields.
 */
function writeToolkitManifest(): void {
  const pkg = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf-8"),
  );

  const strip = (value: unknown): unknown => {
    if (typeof value === "string")
      return value.replace(/^\.\/dist\/toolkit\//, "./");
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, strip(v)]),
      );
    }
    return value;
  };

  const manifest: Record<string, any> = { ...pkg };
  delete manifest.files;
  delete manifest.scripts;
  delete manifest.devDependencies;
  delete manifest["lint-staged"];
  manifest.publishConfig = { access: "public" };

  for (const field of ["exports", "main", "module", "types", "bin"]) {
    if (manifest[field]) manifest[field] = strip(manifest[field]);
  }

  writeFileSync(
    path.join(DIST, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  writeFileSync(path.join(DIST, ".npmignore"), "*.tgz\n");
  console.log("✓ Wrote toolkit manifest → dist/toolkit/package.json");
}

/**
 * Generate the @bonsae/nrg-runtime manifest into dist/runtime. The runtime has
 * no source package.json: it's derived from the root package.json (version,
 * author, etc.) plus the dependency NAMES listed in build/runtime/dependencies
 * (their ranges are read from the root's own dependencies — the single source
 * of truth). Ships only `./server` VALUES; no types, no internal surface.
 */
function writeRuntimeManifest(): void {
  const root = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf-8"),
  );
  const names = readFileSync(path.join(RUNTIME_SRC, "dependencies"), "utf-8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const dependencies: Record<string, string> = {};
  for (const name of names) {
    const range = root.dependencies?.[name];
    if (!range) {
      throw new Error(
        `build/runtime/dependencies lists "${name}", which is not in the root package.json "dependencies".`,
      );
    }
    dependencies[name] = range;
  }

  const manifest = {
    name: "@bonsae/nrg-runtime",
    version: root.version,
    description:
      "The runtime for Node-RED nodes built with @bonsae/nrg — node base classes, schemas, AJV validator, and the editor client. Carries no build tooling.",
    author: root.author,
    license: root.license,
    type: "commonjs",
    homepage: root.homepage,
    bugs: root.bugs,
    repository: root.repository,
    publishConfig: { access: "public" },
    engines: root.engines,
    keywords: [
      "node-red",
      "vue",
      "vue3",
      "typescript",
      "json-schema",
      "iot",
      "automation",
      "low-code",
      "framework",
    ],
    exports: {
      "./server": {
        require: "./server/index.cjs",
        default: "./server/index.cjs",
      },
    },
    dependencies,
  };

  writeFileSync(
    path.join(RUNTIME_DIST, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  writeFileSync(path.join(RUNTIME_DIST, ".npmignore"), "*.tgz\n");
  console.log("✓ Wrote runtime manifest → dist/runtime/package.json");
}

// ---------------------------------------------------------------------------
// Toolkit entries (the @bonsae/nrg surface: index, vite plugin, test utils)
// ---------------------------------------------------------------------------

function buildRootEntry() {
  esbuildBundle("src/index.ts", { outfile: "dist/toolkit/index.js" });
  console.log("✓ Built root entry → dist/toolkit/index.js");
}

function buildVitePlugin() {
  esbuildBundle("src/vite/index.ts", { outdir: "dist/toolkit/vite" });
  console.log("✓ Built vite plugin → dist/toolkit/vite/");
}

function buildEslintConfig() {
  // The shared ESLint conventions (@bonsae/nrg/eslint), spread into a consumer's
  // flat config. Self-contained (no eslint type-import in the bundle), so it
  // emits like the test configs — values only, no .d.ts.
  esbuildBundle("src/eslint/index.ts", {
    outfile: "dist/toolkit/eslint/index.js",
  });
  console.log("✓ Built eslint config → dist/toolkit/eslint/index.js");
}

function buildSchemaEntry() {
  // The neutral schema kit (@bonsae/nrg/schema): defineSchema + SchemaType built
  // from the browser-safe core/shared/schemas tree (TypeBox only, no node
  // runtime). Schema modules import the builders from here so the shared
  // contract never reaches into `./server`. Ships CJS VALUES like the server
  // entry — consumers `require` it in dev; the production build rewrites the
  // import to @bonsae/nrg-runtime/server, which re-exports the same values.
  esbuildBundle("src/core/shared/schemas/index.ts", {
    format: "cjs",
    outfile: "dist/toolkit/schema/index.cjs",
  });
  console.log("✓ Built schema kit → dist/toolkit/schema/index.cjs");
}

async function buildTestUtils() {
  esbuildBundle("src/test/server/unit/index.ts", {
    outdir: "dist/toolkit/test/server/unit",
  });
  esbuildBundle("src/test/server/unit/config.ts", {
    outdir: "dist/toolkit/test/server/unit",
  });
  esbuildBundle("src/test/server/integration/index.ts", {
    outdir: "dist/toolkit/test/server/integration",
    // Keep the host's nrg copy: runtime.ts imports registerTypes from here so
    // registration binds to the SAME Node class the consumer's nodes extend
    // (otherwise instanceof Node fails). Externalizing it also stops the bundle
    // inlining the core server (its assets.ts __dirname / ajv deep-import).
    external: ["@bonsae/nrg/server"],
  });
  esbuildBundle("src/test/server/integration/config.ts", {
    outdir: "dist/toolkit/test/server/integration",
  });
  assertEsmTestBundles();
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
    outdir: "dist/toolkit/test/client/component",
  });
  // Node-context globalSetup (no Vue) that serializes node schemas for the
  // browser component tests. Bundled standalone like config.ts.
  esbuildBundle("src/test/client/component/schemas.ts", {
    outdir: "dist/toolkit/test/client/component",
  });
  esbuildBundle("src/test/client/unit/index.ts", {
    outdir: "dist/toolkit/test/client/unit",
  });
  esbuildBundle("src/test/client/unit/config.ts", {
    outdir: "dist/toolkit/test/client/unit",
  });
  esbuildBundle("src/test/client/unit/setup.ts", {
    outdir: "dist/toolkit/test/client/unit",
  });
  esbuildBundle("src/test/client/e2e/index.ts", {
    outdir: "dist/toolkit/test/client/e2e",
  });
  esbuildBundle("src/test/client/e2e/config.ts", {
    outdir: "dist/toolkit/test/client/e2e",
  });
  console.log("✓ Built test utilities → dist/toolkit/test/");
}

// ---------------------------------------------------------------------------
// Core build (shared by both packages: server VALUES + editor client asset)
// ---------------------------------------------------------------------------

function buildCoreServer() {
  // The core server, as a self-contained CJS bundle with external deps. This is
  // the runtime VALUES served at ./server. The toolkit owns this bundle, and
  // the runtime artifact ships the very same bytes (deps are external, so the
  // bundle is identical for both packages).
  esbuildBundle("src/core/server/index.ts", {
    format: "cjs",
    outfile: "dist/toolkit/server/index.cjs",
  });
  console.log("✓ Built core server → dist/toolkit/server/index.cjs");
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
  console.log(
    "✓ Built client asset → dist/toolkit/server/resources/nrg-client.js",
  );
}

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

function generateTypes() {
  // ----- toolkit-owned surface (index, vite, test-*) -----
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/index.d.ts src/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );

  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/vite.d.ts src/vite/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  appendFileSync(
    "dist/toolkit/types/vite.d.ts",
    `
import type { Plugin } from "vite";
export declare function nrg(options?: NrgPluginOptions): Plugin[];
`,
  );

  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-server-unit.d.ts src/test/server/unit/index.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-server-integration.d.ts src/test/server/integration/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-component.d.ts src/test/client/component/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-component-schemas.d.ts src/test/client/component/schemas.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-unit.d.ts src/test/client/unit/index.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  // NOTE: `zod` must stay a devDependency for this step. No source imports it,
  // but playwright-core's published types.d.ts imports `zod`/`zod/v3` at the top
  // level (an optional typed-assertion integration, guarded with @ts-ignore so
  // tsc tolerates its absence). dts-bundle-generator is stricter — it eagerly
  // resolves those imports while bundling this e2e d.ts and hard-fails if zod
  // isn't installed. The --external-imports flags don't bypass it. Do not remove
  // zod just because it looks unused.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-e2e.d.ts src/test/client/e2e/index.ts ${DTS_FLAGS} --external-imports playwright --external-imports playwright-core`,
    { stdio: "inherit" },
  );

  // ----- core surface (server + client), natively owned & generated here -----
  // Consumers resolve every nrg type *here* (the ESM toolkit), never through
  // the transitive CJS runtime — that boundary splits TypeBox into nominally
  // incompatible cjs/esm `TObject` builds.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/server.d.ts src/core/server/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  const serverDts = readFileSync("dist/toolkit/types/server.d.ts", "utf-8");
  writeFileSync(
    "dist/toolkit/types/server.d.ts",
    `/// <reference path="./shims/typebox.d.ts" />\n${serverDts}`,
  );

  // The neutral schema kit (@bonsae/nrg/schema) — defineSchema/SchemaType and
  // the plane-neutral schema types. Plane-specific `Infer` stays in ./server
  // and ./client. Same TypeBox shim as the server surface.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/schema.d.ts src/core/shared/schemas/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  const schemaDts = readFileSync("dist/toolkit/types/schema.d.ts", "utf-8");
  writeFileSync(
    "dist/toolkit/types/schema.d.ts",
    `/// <reference path="./shims/typebox.d.ts" />\n${schemaDts}`,
  );

  // Generated from the curated client/public.ts (not the raw ./types) so the
  // editor-runtime internals stay out of the public ./client surface.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/client.d.ts src/core/client/public.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  appendFileSync(
    "dist/toolkit/types/client.d.ts",
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

  console.log("✓ Generated type declarations → dist/toolkit/types/");
}

function copyShims() {
  mkdirSync("dist/toolkit/types/shims/client", { recursive: true });
  copyFileSync(
    "src/core/client/shims-vue.d.ts",
    "dist/toolkit/types/shims/shims-vue.d.ts",
  );
  copyFileSync(
    "src/core/client/globals.d.ts",
    "dist/toolkit/types/shims/client/globals.d.ts",
  );
  copyFileSync(
    "src/core/server/typebox.d.ts",
    "dist/toolkit/types/shims/typebox.d.ts",
  );
  copyFileSync(
    "src/core/shared/schema-options.ts",
    "dist/toolkit/types/shims/schema-options.d.ts",
  );
  console.log("✓ Copied core shims → dist/toolkit/types/shims/");
}

function generateComponentTypes() {
  execSync("npx vue-tsc -p tsconfig.vue-dts.json", { stdio: "inherit" });

  // vue-tsc mirrors the src-relative path under outDir; the .vue files live at
  // src/core/client/form/components/*.vue, so the emitted declarations land
  // under shims/core/client/form/components/.
  const componentsDir = "dist/toolkit/types/shims/core/client/form/components";
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
    "dist/toolkit/types/shims/components.d.ts",
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
  console.log(
    "✓ Generated component type declarations → dist/toolkit/types/shims/",
  );
}

// ---------------------------------------------------------------------------
// Toolkit assets (tsconfig + schemas + README/LICENSE)
// ---------------------------------------------------------------------------

function copyAssets() {
  mkdirSync("dist/toolkit/tsconfig", { recursive: true });
  cpSync("src/tsconfig", "dist/toolkit/tsconfig", { recursive: true });
  cpSync("src/assets", "dist/toolkit/schemas", { recursive: true });

  // The package publishes from dist/toolkit (publishConfig.directory), so
  // README and LICENSE go in there.
  for (const f of ["README.md", "LICENSE"]) {
    const src = path.join(ROOT, f);
    if (existsSync(src)) copyFileSync(src, path.join(DIST, f));
  }
  console.log(
    "✓ Copied tsconfigs, schemas, README, and LICENSE → dist/toolkit",
  );
}

// ---------------------------------------------------------------------------
// Runtime artifact (the @bonsae/nrg-runtime publishable package)
// ---------------------------------------------------------------------------

function emitRuntimeArtifact() {
  // The runtime is the light subset of the toolkit's core output: the server
  // VALUES bundle and the editor client asset. The server.cjs is self-contained
  // (external deps), so the same bytes are valid for both packages. It ships no
  // types and nothing from internal/* — a deployed node needs values, not a
  // type or test-support surface.
  mkdirSync(path.join(RUNTIME_DIST, "server"), { recursive: true });
  copyFileSync(
    path.join(DIST, "server/index.cjs"),
    path.join(RUNTIME_DIST, "server/index.cjs"),
  );
  cpSync(
    path.join(DIST, "server/resources"),
    path.join(RUNTIME_DIST, "server/resources"),
    { recursive: true },
  );

  writeRuntimeManifest();
  copyFileSync(
    path.join(RUNTIME_SRC, "README.md"),
    path.join(RUNTIME_DIST, "README.md"),
  );
  const license = path.join(ROOT, "LICENSE");
  if (existsSync(license))
    copyFileSync(license, path.join(RUNTIME_DIST, "LICENSE"));

  console.log("✓ Emitted @bonsae/nrg-runtime artifact → dist/runtime");
}

// ---------------------------------------------------------------------------

async function main() {
  clean(path.resolve(ROOT, "dist")); // wipe both dist/toolkit and dist/runtime
  // Toolkit surface.
  buildRootEntry();
  buildVitePlugin();
  buildEslintConfig();
  buildSchemaEntry();
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
  writeToolkitManifest();
  console.log("✓ @bonsae/nrg (toolkit) built → dist/toolkit");
  // Emit the second published package from the core subset.
  emitRuntimeArtifact();
  console.log("✓ @bonsae/nrg-runtime artifact emitted → dist/runtime");
}

main();
