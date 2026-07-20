import { execSync, execFileSync } from "node:child_process";
import {
  mkdirSync,
  copyFileSync,
  cpSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

// This script lives at build/index.ts and runs with cwd = the repo root
// (pnpm build → tsx build/index.ts). One build emits BOTH published packages
// under dist/:
//   - @bonsae/nrg         (the toolkit)               → dist/toolkit
//   - @bonsae/nrg-runtime (light artifact for nodes)  → dist/runtime
//
// The runtime is NOT a source package: its publishable contents are a copied
// subset of the toolkit's runtime output (server VALUES + editor client asset),
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
    define = {},
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
    // Compile-time string constants to inline (esbuild --define). Values are the
    // raw strings; they are JSON-encoded (not shell-quoted — execFileSync passes
    // args literally) so esbuild substitutes them as string literals (e.g.
    // __NRG_CLIENT_ASSET__).
    define?: Record<string, string>;
  },
): void {
  const out = outfile ? `--outfile=${outfile}` : `--outdir=${outdir}`;
  // execFileSync (no shell) — args are passed literally, so `--define` values
  // are JSON-encoded but NOT shell-quoted. Shell-quoting them (the single-quote
  // wrapping this used to do) is a Unix-ism cmd.exe wouldn't strip, and the
  // whole point of skipping the shell is to sidestep that class of breakage.
  const args = [
    entry,
    "--bundle",
    "--packages=external",
    `--format=${format}`,
    "--platform=node",
    ...external.map((e) => `--external:${e}`),
    ...Object.entries(define).map(
      ([k, v]) => `--define:${k}=${JSON.stringify(v)}`,
    ),
    out,
  ];
  execFileSync("esbuild", args, { stdio: "inherit" });
}

/**
 * Post-build invariant guard for the published server test bundles. They are
 * ESM and must NOT inline server runtime VALUES: a regression here ships broken to
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
  for (const rel of entries) {
    const code = readFileSync(path.join(DIST, rel), "utf-8");
    // (1) No CJS globals in an ESM bundle (the inlined-assets.ts __dirname bug).
    //     Scoped to these four entries only — the client e2e bundle legitimately
    //     carries `__dirname` inside launcher template strings. (The
    //     extensionless-deep-import check — formerly (2) here — is now
    //     assertNoExtensionlessDeepImports() over the whole shipped surface.)
    if (/\b__dirname\b/.test(code) || /\b__filename\b/.test(code)) {
      problems.push(`${rel}: references __dirname/__filename in an ESM bundle`);
    }
  }
  // (3) The integration entry must keep @bonsae/nrg/server external and inline
  //     no server runtime values (the 0.26.2 instanceof-Node regression).
  const integ = readFileSync(
    path.join(DIST, "test/server/integration/index.js"),
    "utf-8",
  );
  if (!/\bfrom\s+"@bonsae\/nrg\/server"/.test(integ)) {
    problems.push(
      "test/server/integration/index.js: @bonsae/nrg/server is not external (server runtime inlined → duplicate Node identity)",
    );
  }
  for (const marker of ["initValidator", "initRoutes"]) {
    if (integ.includes(marker)) {
      problems.push(
        `test/server/integration/index.js: inlines server runtime "${marker}" (must resolve via the external @bonsae/nrg/server)`,
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
 * Extensionless deep imports (`from "pkg/dist/x"` with no file extension) are
 * the one *silent* shipped-bundle failure class: Node's native ESM resolver
 * rejects them, but they run fine in-repo (bundler resolution is lenient). This
 * globs EVERY shipped test + vite bundle — not just the four server test entries
 * assertEsmTestBundles guards — so the class can't slip in through the vite
 * plugin or a client test bundle. No allow-list needed: a bare `pkg/dir/file`
 * always needs an extension.
 */
function assertNoExtensionlessDeepImports(): void {
  const deepImport =
    /\bfrom\s+"([a-z@][^"]*\/(?:dist|lib|build|cjs|esm|src)\/[^"]*)"/g;
  const problems: string[] = [];
  for (const root of ["test", "vite"]) {
    const dir = path.join(DIST, root);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir, { recursive: true }) as string[];
    for (const rel of files) {
      if (!rel.endsWith(".js")) continue;
      const code = readFileSync(path.join(dir, rel), "utf-8");
      for (const m of code.matchAll(deepImport)) {
        if (!/\.(js|cjs|mjs|json)$/.test(m[1])) {
          problems.push(`${root}/${rel}: extensionless deep import "${m[1]}"`);
        }
      }
    }
  }
  if (problems.length) {
    throw new Error(
      "Extensionless deep-import invariant violated (Node's ESM resolver rejects these):\n  - " +
        problems.join("\n  - "),
    );
  }
  console.log(
    "✓ Verified shipped test/vite bundles carry no extensionless deep imports",
  );
}

/**
 * Post-emit guard: every bare package the runtime `.cjs` bundles `require()` at
 * runtime must be declared in @bonsae/nrg-runtime's dependencies — otherwise the
 * published runtime throws MODULE_NOT_FOUND on a real install while staying green
 * in-repo (deps resolve through the toolkit's own node_modules). The dependency
 * list is hand-maintained (build/runtime/dependencies), and the existing check
 * only verifies each listed name exists — nothing checked the reverse. Direction
 * here is bundle→deps. `vue` is resolved dynamically (createRequire in assets.ts)
 * so a require-scan can't see it — it's listed explicitly.
 */
function assertRuntimeDepsCovered(deps: Record<string, string>): void {
  const DYNAMIC_RUNTIME_DEPS = ["vue"];
  const builtins = new Set(builtinModules);
  const requireCall = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  const found = new Set<string>();
  for (const rel of ["index.cjs"]) {
    const file = path.join(RUNTIME_DIST, rel);
    if (!existsSync(file)) continue;
    const code = readFileSync(file, "utf-8");
    for (const m of code.matchAll(requireCall)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      if (spec.startsWith("node:")) continue;
      const name = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (!builtins.has(name)) found.add(name);
    }
  }
  const problems = [
    ...[...found]
      .filter((n) => !(n in deps))
      .map(
        (n) =>
          `runtime bundle require()s "${n}", not declared in @bonsae/nrg-runtime dependencies`,
      ),
    ...DYNAMIC_RUNTIME_DEPS.filter((n) => !(n in deps)).map(
      (n) =>
        `dynamically-resolved "${n}" missing from @bonsae/nrg-runtime dependencies`,
    ),
  ];
  if (problems.length) {
    throw new Error(
      "Runtime dependency-closure invariant violated:\n  - " +
        problems.join("\n  - "),
    );
  }
  console.log(
    "✓ Verified @bonsae/nrg-runtime declares every required dependency",
  );
}

/**
 * Collapse an already-built bundle with a final esbuild minify pass, in place.
 * No `--bundle`, so external imports (e.g. a URL-pathed `vue`) are untouched.
 */
function minifyFile(file: string, format = "esm"): void {
  execFileSync(
    "esbuild",
    [
      file,
      "--minify",
      `--format=${format}`,
      "--allow-overwrite",
      `--outfile=${file}`,
    ],
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
 * of truth). Ships a SINGLE `.` entry (server + schema VALUES in one bundle) —
 * the production import rewrite maps both `@bonsae/nrg/server` and
 * `@bonsae/nrg/schema` to bare `@bonsae/nrg-runtime`. No types, no internal surface.
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
      ".": {
        require: "./index.cjs",
        default: "./index.cjs",
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

function buildVitePlugin(clientAsset: string) {
  // Inject the content-hashed client filename so the plugin rewrites a
  // consumer's `@bonsae/nrg/client` import to the exact hashed URL the runtime
  // serves (src/tools/vite/client/build.ts reads __NRG_CLIENT_ASSET__).
  esbuildBundle("src/tools/vite/index.ts", {
    outdir: "dist/toolkit/vite",
    define: { __NRG_CLIENT_ASSET__: clientAsset },
  });
  // Also emit the Node-RED-settings helper as a standalone, dependency-free leaf.
  // A `node-red.settings.ts` imports `defineNodeRedSettings` from
  // `@bonsae/nrg/vite`, but that file is esbuild-bundled into Node-RED's runtime
  // settings (node-red-launcher/settings.ts) — resolving the full vite entry there
  // would drag the dev toolchain's native deps (chokidar→fsevents, vite→
  // lightningcss) into the settings bundle and break `nrg dev`. The settings
  // compiler resolves the import to this leaf (a bare identity helper) instead.
  esbuildBundle("src/tools/vite/node-red-settings.ts", {
    outfile: "dist/toolkit/vite/node-red-settings.js",
  });
  // Invariant: the Node-RED-settings compiler (node-red-launcher/settings.ts)
  // resolves this leaf co-located with the `./vite` entry — `dirname(resolve(
  // "@bonsae/nrg/vite")) + this basename`. If a refactor moves or renames the
  // emit, `resolveSettingsHelperLeaf` silently returns null, the redirect never
  // registers, and a consumer's `node-red.settings.ts` drags the plugin's native
  // deps (chokidar→fsevents, vite→lightningcss) into the settings bundle → `nrg
  // dev` breaks. Fail the build loudly instead of shipping that.
  const settingsLeaf = path.join(DIST, "vite/node-red-settings.js");
  if (!existsSync(settingsLeaf)) {
    throw new Error(
      `Node-RED-settings helper leaf not emitted at ${settingsLeaf} — settings.ts's redirect will fall back to bundling the full @bonsae/nrg/vite plugin and break nrg dev.`,
    );
  }
  console.log("✓ Built vite plugin → dist/toolkit/vite/");

  // The wire check ships as a separate installable Node-RED plugin,
  // @bonsae/node-red-type-check-plugin (server + editor painter), which the dev
  // launcher auto-loads from the consumer's install — it is no longer bundled
  // into the toolkit.
}

function buildEslintConfig() {
  // The shared ESLint conventions (@bonsae/nrg/eslint) — a complete, drop-in
  // flat-config array a consumer uses as `export default nrg`. The
  // eslint plugins it pulls in (@eslint/js, typescript-eslint, eslint-plugin-vue,
  // eslint-config-prettier, globals) stay external via --packages=external and
  // resolve from the consumer's install (they're runtime deps of @bonsae/nrg).
  // Emits like the test configs — values only, no .d.ts.
  esbuildBundle("src/tools/eslint/index.ts", {
    outfile: "dist/toolkit/eslint/index.js",
  });
  console.log("✓ Built eslint config → dist/toolkit/eslint/index.js");
}

function buildPrettierConfig() {
  // The shared Prettier config (@bonsae/nrg/prettier) — a plain options object a
  // consumer re-exports from their own prettier config. It only `import type`s
  // from prettier, so the bundle carries no runtime dependency. Values only, no
  // .d.ts (like the eslint config).
  esbuildBundle("src/tools/prettier/index.ts", {
    outfile: "dist/toolkit/prettier/index.js",
  });
  console.log("✓ Built prettier config → dist/toolkit/prettier/index.js");
}

function buildSchemaEntry() {
  // The neutral schema kit (@bonsae/nrg/schema): defineSchema + SchemaType built
  // from the browser-safe sdk/lib/shared/schemas tree (TypeBox only, no node
  // runtime). Schema modules import the builders from here so the shared
  // contract never reaches into `./server`. Ships CJS VALUES like the server
  // entry — consumers `require` it in dev; the production build rewrites the
  // import to @bonsae/nrg-runtime, the same bytes shipped by the runtime.
  esbuildBundle("src/sdk/lib/shared/schemas/index.ts", {
    format: "cjs",
    outfile: "dist/toolkit/lib/schema/index.cjs",
  });
  console.log("✓ Built schema kit → dist/toolkit/lib/schema/index.cjs");
}

async function buildTestUtils() {
  esbuildBundle("src/sdk/test/server/unit/index.ts", {
    outdir: "dist/toolkit/test/server/unit",
  });
  esbuildBundle("src/sdk/test/server/unit/config.ts", {
    outdir: "dist/toolkit/test/server/unit",
  });
  esbuildBundle("src/sdk/test/server/integration/index.ts", {
    outdir: "dist/toolkit/test/server/integration",
    // Keep the host's nrg copy: runtime.ts imports registerTypes from here so
    // registration binds to the SAME Node class the consumer's nodes extend
    // (otherwise instanceof Node fails). Externalizing it also stops the bundle
    // inlining the server runtime (its assets.ts __dirname / ajv deep-import).
    external: ["@bonsae/nrg/server"],
  });
  esbuildBundle("src/sdk/test/server/integration/config.ts", {
    outdir: "dist/toolkit/test/server/integration",
  });
  assertEsmTestBundles();
  // index.ts/setup.ts pull in Vue-touching modules — use vite with the vue
  // plugin. All bare imports are external (consumers resolve them).
  await viteBuild({
    configFile: false,
    logLevel: "warn",
    plugins: [vue()],
    // Mirror the `@/*` → `src/*` alias the tsconfigs declare so the test
    // libraries can import runtime internals by alias instead of `../../../sdk/lib`.
    resolve: {
      alias: [{ find: /^@\//, replacement: path.resolve(ROOT, "src") + "/" }],
    },
    build: {
      outDir: path.join(DIST, "test/client/component"),
      emptyOutDir: false,
      lib: {
        entry: {
          index: path.resolve(ROOT, "src/sdk/test/client/component/index.ts"),
          setup: path.resolve(ROOT, "src/sdk/test/client/component/setup.ts"),
        },
        formats: ["es"],
      },
      rollupOptions: {
        // `@/…` is an internal alias (resolved above) — bundle it; only real
        // bare/absolute specifiers stay external.
        external: (id) =>
          !id.startsWith(".") && !path.isAbsolute(id) && !id.startsWith("@/"),
      },
    },
  });
  esbuildBundle("src/sdk/test/client/component/config.ts", {
    outdir: "dist/toolkit/test/client/component",
  });
  // Node-context globalSetup (no Vue) that serializes node schemas for the
  // browser component tests. Bundled standalone like config.ts.
  esbuildBundle("src/sdk/test/client/component/schemas.ts", {
    outdir: "dist/toolkit/test/client/component",
  });
  esbuildBundle("src/sdk/test/client/unit/index.ts", {
    outdir: "dist/toolkit/test/client/unit",
  });
  esbuildBundle("src/sdk/test/client/unit/config.ts", {
    outdir: "dist/toolkit/test/client/unit",
  });
  esbuildBundle("src/sdk/test/client/unit/setup.ts", {
    outdir: "dist/toolkit/test/client/unit",
  });
  esbuildBundle("src/sdk/test/client/e2e/index.ts", {
    outdir: "dist/toolkit/test/client/e2e",
  });
  esbuildBundle("src/sdk/test/client/e2e/config.ts", {
    outdir: "dist/toolkit/test/client/e2e",
  });
  console.log("✓ Built test utilities → dist/toolkit/test/");
}

// ---------------------------------------------------------------------------
// Core build (shared by both packages: server VALUES + editor client asset)
// ---------------------------------------------------------------------------

function buildCoreServer(clientAsset: string) {
  // The server runtime, as a self-contained CJS bundle with external deps. This is
  // the runtime VALUES served at ./server. The toolkit owns this bundle, and
  // the runtime artifact ships the very same bytes (deps are external, so the
  // bundle is identical for both packages).
  //
  // Inject the content-hashed client filename so the assets route serves the
  // editor client at the exact hashed URL (src/sdk/lib/server/api/assets.ts reads
  // __NRG_CLIENT_ASSET__). The hash busts the editor cache across releases.
  esbuildBundle("src/sdk/lib/server/index.ts", {
    format: "cjs",
    outfile: "dist/toolkit/lib/server/index.cjs",
    define: { __NRG_CLIENT_ASSET__: clientAsset },
  });
  console.log("✓ Built server runtime → dist/toolkit/lib/server/index.cjs");
}

async function buildClientAsset(): Promise<string> {
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
      outDir: path.join(DIST, "lib/server/resources"),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(ROOT, "src/sdk/lib/client/index.ts"),
        name: "NrgClient",
        // Force .js (not .mjs) — this is a static asset the editor loads from a
        // URL; the toolkit being type:module would otherwise make vite emit
        // .mjs for the ES bundle.
        fileName: () => "nrg.js",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["vue"],
        output: { paths: { vue: "/nrg/assets/vue.js" } },
      },
    },
  });
  // Vite leaves a newline between every concatenated module (~270KB over
  // thousands of lines); a final esbuild pass collapses the whitespace to
  // ~190KB without disturbing the externalized `vue` import.
  const clientPath = path.join(DIST, "lib/server/resources/nrg.js");
  minifyFile(clientPath);
  // Content-hash the filename so the editor never serves a stale cached client
  // across releases. The hash is injected into the server bundle (assets route)
  // and the vite plugin, which is why the client builds before both — they emit
  // the exact hashed URL this asset ships under.
  const clientHash = createHash("sha256")
    .update(readFileSync(clientPath))
    .digest("hex")
    .slice(0, 8);
  const hashedClient = `nrg.${clientHash}.js`;
  renameSync(clientPath, path.join(DIST, "lib/server/resources", hashedClient));
  console.log(
    `✓ Built client asset → dist/toolkit/lib/server/resources/${hashedClient}`,
  );
  return hashedClient;
}

/**
 * Post-build guard: the content-hashed client filename must be wired into every
 * place that references it — the shipped asset, the server bundle's assets route
 * (__NRG_CLIENT_ASSET__ inlined), and the vite plugin (same inline). A silent
 * miss here ships an editor that requests a URL the runtime never serves, or a
 * runtime that serves a URL no consumer references. Cheap, deterministic, fails
 * the build the instant injection breaks.
 */
function assertClientAssetWired(clientAsset: string): void {
  const problems: string[] = [];
  const asset = path.join(DIST, "lib/server/resources", clientAsset);
  if (!existsSync(asset)) {
    problems.push(`missing hashed client asset: ${clientAsset}`);
  }
  const server = readFileSync(path.join(DIST, "lib/server/index.cjs"), "utf-8");
  if (!server.includes(clientAsset)) {
    problems.push(
      `lib/server/index.cjs does not reference the hashed client "${clientAsset}" (assets route __NRG_CLIENT_ASSET__ not injected)`,
    );
  }
  const vite = readFileSync(path.join(DIST, "vite/index.js"), "utf-8");
  if (!vite.includes(clientAsset)) {
    problems.push(
      `vite/index.js does not reference the hashed client "${clientAsset}" (client-build __NRG_CLIENT_ASSET__ not injected)`,
    );
  }
  if (problems.length) {
    throw new Error(
      "Client-asset wiring invariant violated:\n  - " + problems.join("\n  - "),
    );
  }
  console.log(
    `✓ Verified hashed client asset wired everywhere: ${clientAsset}`,
  );
}

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

/**
 * `Channels` is a `unique symbol`, so its TYPE identity is its declaration site.
 * dts-bundle-generator INLINES that declaration into every entry bundle it emits —
 * so `server.d.ts` and `test-server-unit.d.ts` each get a SEPARATE `unique symbol`.
 * In a consumer that installs both, `msg[Channels]` (server's symbol) then can't
 * index the `[Channels]` key the harness bakes into `sent()` / `receive()` frames
 * (test-unit's symbol) — the read only type-checks through a cast.
 *
 * Rewrite the inlined declaration in the test-unit bundle into an IMPORT from the
 * sibling `@bonsae/nrg/server` bundle, so both surfaces share ONE symbol identity in
 * a consumer and `sent(...)[i][Channels]` / `receive(msg, channels)` type cast-free.
 * (nrg's OWN tests never see this bundle: they resolve the harness to source via a
 * paths alias, where a single `Channels` declaration already serves both planes.)
 *
 * dts-bundle-generator's `--external-imports` only externalizes packages resolvable
 * under node_modules, and nrg isn't in its own node_modules — hence this rewrite.
 */
function shareChannelsSymbol(dtsPath: string): void {
  const SYMBOLS = ["Channels", "Meta"];
  let content = readFileSync(dtsPath, "utf-8");
  for (const name of SYMBOLS) {
    const decl = `declare const ${name}: unique symbol;\n`;
    if (!content.includes(decl)) {
      throw new Error(
        `${dtsPath}: could not find the inlined \`${decl.trim()}\` to rewrite ` +
          `into a shared import from "@bonsae/nrg/server". The ` +
          `dts-bundle-generator output shape changed — without this the ${name} ` +
          `unique symbol silently fragments across bundles and consumer tests ` +
          `need a cast to read \`sent(...)[i][${name}]\`.`,
      );
    }
    content = content.replace(decl, "");
  }
  writeFileSync(
    dtsPath,
    `import { ${SYMBOLS.join(", ")} } from "@bonsae/nrg/server";\n` + content,
  );
  console.log(
    `✓ Shared the ${SYMBOLS.join(" + ")} symbols from @bonsae/nrg/server → test-server-unit.d.ts`,
  );
}

function generateTypes() {
  // ----- toolkit-owned surface (vite, test-*) — no bare-root `.` types -----
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/vite.d.ts src/tools/vite/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  // vite.d.ts is generated from types.ts, so the value re-exports in vite/index.ts
  // don't reach it — append the plugin + the Node-RED-settings helper by hand.
  // `./server` resolves to the sibling dist/toolkit/types/server.d.ts.
  appendFileSync(
    "dist/toolkit/types/vite.d.ts",
    `
import type { Plugin } from "vite";
import type { NodeRedSettings } from "./server";
export declare function nrg(options?: NrgPluginOptions): Plugin[];
export declare function defineNodeRedSettings(settings: NodeRedSettings): NodeRedSettings;
export type { NodeRedSettings };
`,
  );

  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-server-unit.d.ts src/sdk/test/server/unit/index.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  shareChannelsSymbol("dist/toolkit/types/test-server-unit.d.ts");
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-server-integration.d.ts src/sdk/test/server/integration/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-component.d.ts src/sdk/test/client/component/types.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-component-schemas.d.ts src/sdk/test/client/component/schemas.ts ${DTS_FLAGS} --external-types vitest`,
    { stdio: "inherit" },
  );
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-unit.d.ts src/sdk/test/client/unit/index.ts ${DTS_FLAGS} --external-types vitest`,
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
    `npx dts-bundle-generator -o dist/toolkit/types/test-client-e2e.d.ts src/sdk/test/client/e2e/index.ts ${DTS_FLAGS} --external-imports playwright --external-imports playwright-core`,
    { stdio: "inherit" },
  );

  // ----- native surface (server + client), natively owned & generated here -----
  // Consumers resolve every nrg type *here* (the ESM toolkit), never through
  // the transitive CJS runtime — that boundary splits TypeBox into nominally
  // incompatible cjs/esm `TObject` builds.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/server.d.ts src/sdk/lib/server/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  const serverDts = readFileSync("dist/toolkit/types/server.d.ts", "utf-8");
  writeFileSync(
    "dist/toolkit/types/server.d.ts",
    `/// <reference path="./shims/lib/shared/typebox.d.ts" />\n${serverDts}`,
  );

  // The neutral schema kit (@bonsae/nrg/schema) — defineSchema/SchemaType and
  // the plane-neutral schema types. Plane-specific `Infer` stays in ./server
  // and ./client. Same TypeBox shim as the server surface.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/schema.d.ts src/sdk/lib/shared/schemas/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  const schemaDts = readFileSync("dist/toolkit/types/schema.d.ts", "utf-8");
  writeFileSync(
    "dist/toolkit/types/schema.d.ts",
    `/// <reference path="./shims/lib/shared/typebox.d.ts" />\n${schemaDts}`,
  );

  // Generated from the curated client/public.ts (not the raw ./types) so the
  // editor-runtime internals stay out of the public ./client surface.
  execSync(
    `npx dts-bundle-generator -o dist/toolkit/types/client.d.ts src/sdk/lib/client/public.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  // useFormNode is generated from public.ts (value-re-export) — its signature is
  // internals-free. defineNode/registerType/registerTypes stay hand-written:
  // generating them from source would drag the .vue editor runtime into the
  // public surface. tests/sdk/client/unit/client-dts-guard.test-d.ts pins these
  // three to the real runtime so tsc fails the moment a signature drifts.
  appendFileSync(
    "dist/toolkit/types/client.d.ts",
    `
export declare function defineNode<T extends NodeDefinition>(options: T): T;
export declare function registerType(definition: NodeDefinition): Promise<void>;
export declare function registerTypes(nodes: NodeDefinition[]): Promise<void>;
`,
  );

  console.log("✓ Generated type declarations → dist/toolkit/types/");
}

function copyShims() {
  // Shim .d.ts land under dist shims/lib/{client,shared}/, matching the
  // published tsconfigs' `include` paths (src/tools/tsc/lib/client.json, …). In
  // source they live in a `shims/` subfolder (src/sdk/lib/client/shims/) but are
  // flattened here alongside vue-tsc's emitted component/type .d.ts.
  mkdirSync("dist/toolkit/types/shims/lib/client", { recursive: true });
  mkdirSync("dist/toolkit/types/shims/lib/shared", { recursive: true });

  // Client shims.
  copyFileSync(
    "src/sdk/lib/client/shims/vue.d.ts",
    "dist/toolkit/types/shims/lib/client/vue.d.ts",
  );
  copyFileSync(
    "src/sdk/lib/client/shims/globals.d.ts",
    "dist/toolkit/types/shims/lib/client/globals.d.ts",
  );

  // Shared shims: the @sinclair/typebox `SchemaOptions` augmentation and the
  // canonical NRG JSON-Schema vocabulary it pulls in (`./schema-options`). Both
  // live on the shared plane — the server tree never names TypeBox — and the
  // server.d.ts / schema.d.ts bundles reference the augmentation from here.
  copyFileSync(
    "src/sdk/lib/shared/typebox.d.ts",
    "dist/toolkit/types/shims/lib/shared/typebox.d.ts",
  );
  copyFileSync(
    "src/sdk/lib/shared/schema-options.ts",
    "dist/toolkit/types/shims/lib/shared/schema-options.d.ts",
  );

  // Test-tier shim: the `sent()` augmentation of `IONode` (targets the shipped
  // `@bonsae/nrg/server`). The base TEST tsconfigs load it via `files`, so a
  // consumer that `extends` them types `node.sent(...)` with no extra setup. Kept
  // out of the lib bundles — `sent` is test-only.
  mkdirSync("dist/toolkit/types/shims/test/server", { recursive: true });
  copyFileSync(
    "src/sdk/test/server/shims/sent.d.ts",
    "dist/toolkit/types/shims/test/server/sent.d.ts",
  );

  console.log("✓ Copied lib shims → dist/toolkit/types/shims/lib/");
}

function generateComponentTypes() {
  execSync("npx vue-tsc -p tsconfig.vue-dts.json", { stdio: "inherit" });

  // vue-tsc mirrors the src-relative path under outDir; the .vue files live at
  // src/sdk/lib/client/form/components/*.vue, so the emitted declarations land
  // under shims/lib/client/form/components/.
  const componentsDir = "dist/toolkit/types/shims/lib/client/form/components";
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
    return `    ${componentName}: (typeof import("./form/components/${baseName}.vue"))["default"];`;
  });

  writeFileSync(
    "dist/toolkit/types/shims/lib/client/components.d.ts",
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
  cpSync("src/tools/tsc", "dist/toolkit/tsconfig", { recursive: true });
  cpSync("src/tools/json-schema", "dist/toolkit/json-schemas", {
    recursive: true,
  });

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

function emitRuntimeArtifact(clientAsset: string) {
  // The runtime is a single self-contained CJS bundle: server + schema VALUES in
  // ONE artifact (src/sdk/lib/runtime.ts re-exports both). At server runtime both
  // planes are server-side, so there is no reason to ship two bundles — and
  // bundling once emits the shared schema layer a single time instead of
  // duplicating it across separate server/schema bundles. It ships no types and
  // nothing from internal/* — a deployed node needs values, not a type or
  // test-support surface. Built here (not copied from the toolkit's split lib/
  // bundles) so the schema code is deduped.
  mkdirSync(RUNTIME_DIST, { recursive: true });
  esbuildBundle("src/sdk/lib/runtime.ts", {
    format: "cjs",
    outfile: path.join(RUNTIME_DIST, "index.cjs"),
    define: { __NRG_CLIENT_ASSET__: clientAsset },
  });
  // The editor client asset the server's assets route serves. It resolves
  // `__dirname/resources` (src/sdk/lib/server/api/assets.ts); __dirname is the
  // bundle's dir, so resources sit next to index.cjs at the runtime root.
  cpSync(
    path.join(DIST, "lib/server/resources"),
    path.join(RUNTIME_DIST, "resources"),
    { recursive: true },
  );

  const runtimeBundle = readFileSync(
    path.join(RUNTIME_DIST, "index.cjs"),
    "utf-8",
  );
  if (!runtimeBundle.includes(clientAsset)) {
    throw new Error(
      `dist/runtime/index.cjs does not reference the hashed client "${clientAsset}" (assets route __NRG_CLIENT_ASSET__ not injected)`,
    );
  }

  writeRuntimeManifest();
  const runtimePkg = JSON.parse(
    readFileSync(path.join(RUNTIME_DIST, "package.json"), "utf-8"),
  );
  assertRuntimeDepsCovered(runtimePkg.dependencies ?? {});
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
  // Toolkit surface. (No bare-root `.` entry — @bonsae/nrg is subpath-only.)
  buildEslintConfig();
  buildPrettierConfig();
  buildSchemaEntry();
  await buildTestUtils();
  // Core (shared) values: editor client asset + server CJS. Build the client
  // FIRST so its content hash can be injected into the server bundle (assets
  // route) and the vite plugin — both emit the exact hashed URL it ships under.
  const clientAsset = await buildClientAsset();
  buildCoreServer(clientAsset);
  buildVitePlugin(clientAsset);
  assertClientAssetWired(clientAsset);
  // Now that every shipped test + vite bundle exists, guard the whole surface.
  assertNoExtensionlessDeepImports();
  // Types (toolkit surface + natively-owned native surface) + shims + components.
  generateTypes();
  copyShims();
  generateComponentTypes();
  // Toolkit assets + publish manifest.
  copyAssets();
  writeToolkitManifest();
  console.log("✓ @bonsae/nrg (toolkit) built → dist/toolkit");
  // Emit the second published package from the runtime subset.
  emitRuntimeArtifact(clientAsset);
  console.log("✓ @bonsae/nrg-runtime artifact emitted → dist/runtime");
}

main();
