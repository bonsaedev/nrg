import { execSync } from "child_process";
import {
  mkdirSync,
  copyFileSync,
  cpSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  existsSync,
  rmSync,
} from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist");
const DIST_RUNTIME = path.resolve(ROOT, "dist-runtime");
const DTS_FLAGS =
  "--no-check --project build/tsconfig.dts.json --export-referenced-types=false";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EsbuildOptions {
  format: string;
  platform?: string;
  outfile?: string;
  outdir?: string;
  /**
   * Specifiers to force external. `--packages=external` already externalizes
   * bare imports, but a tsconfig `paths` mapping (auto-discovered by esbuild)
   * rewrites a matched specifier to a local file BEFORE that check, inlining it.
   * An explicit `--external:` matches the import as written and short-circuits
   * the rewrite — used to keep `@bonsae/nrg/server` external in the integration
   * bundle so it binds to the host's nrg copy at runtime.
   */
  external?: string[];
}

function esbuild(entry: string, { format, platform = "node", outfile, outdir, external = [] }: EsbuildOptions) {
  const out = outfile ? `--outfile=${outfile}` : `--outdir=${outdir}`;
  const ext = external.map((e) => `--external:${e}`).join(" ");
  execSync(
    `esbuild ${entry} --bundle --packages=external --format=${format} --platform=${platform} ${out} ${ext}`,
    { stdio: "inherit" },
  );
}

// ---------------------------------------------------------------------------
// Build phases
// ---------------------------------------------------------------------------

function clean() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  if (existsSync(DIST_RUNTIME)) rmSync(DIST_RUNTIME, { recursive: true });
  console.log("✓ Cleaned dist/ and dist-runtime/");
}

function buildServer() {
  esbuild("src/core/server/index.ts", {
    format: "cjs",
    outfile: "dist/server/index.cjs",
  });
  console.log("✓ Built server to dist/server/");
}

async function buildClient() {
  await viteBuild({
    configFile: false,
    logLevel: "warn",
    plugins: [vue()],
    build: {
      outDir: path.join(DIST, "server/resources"),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(ROOT, "src/core/client/index.ts"),
        name: "NrgClient",
        fileName: "nrg-client",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["vue"],
        output: {
          paths: { vue: "/nrg/assets/vue.esm-browser.prod.js" },
        },
      },
    },
  });
  console.log("✓ Built nrg-client.js to dist/server/resources/");

  // Inline extracted CSS into nrg-client.js so styles load with the script
  const cssPath = path.join(DIST, "server/resources/nrg-client.css");
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, "utf-8");
    const jsPath = path.join(DIST, "server/resources/nrg-client.js");
    const js = readFileSync(jsPath, "utf-8");
    const inject = `(function(){var s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n`;
    writeFileSync(jsPath, inject + js);
    unlinkSync(cssPath);
    console.log("✓ Inlined nrg-client.css into nrg-client.js");
  }
}

function buildRootEntry() {
  esbuild("src/index.ts", { format: "esm", outfile: "dist/index.js" });
  console.log("✓ Built root entry to dist/index.js");
}

function buildVitePlugin() {
  esbuild("src/vite/index.ts", { format: "esm", outdir: "dist/vite" });
  console.log("✓ Built vite plugin to dist/vite/");
}

async function buildTestUtils() {
  esbuild("src/test/server/unit/index.ts", { format: "esm", outdir: "dist/test/server/unit" });
  esbuild("src/test/server/unit/config.ts", { format: "esm", outdir: "dist/test/server/unit" });
  esbuild("src/test/server/integration/index.ts", { format: "esm", outdir: "dist/test/server/integration", external: ["@bonsae/nrg/server"] });
  esbuild("src/test/server/integration/config.ts", { format: "esm", outdir: "dist/test/server/integration" });
  // NOTE: index.ts and setup.ts import .vue SFCs (real form components for
  // plugin tests), which esbuild can't bundle — use vite with the vue plugin.
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
        // Externalize all bare imports (vue, vitest, ajv, ...) — plugin
        // projects resolve them from their own node_modules.
        external: (id) => !id.startsWith(".") && !path.isAbsolute(id),
      },
    },
  });
  esbuild("src/test/client/component/config.ts", { format: "esm", outdir: "dist/test/client/component" });
  esbuild("src/test/client/unit/index.ts", { format: "esm", outdir: "dist/test/client/unit" });
  esbuild("src/test/client/unit/config.ts", { format: "esm", outdir: "dist/test/client/unit" });
  esbuild("src/test/client/unit/setup.ts", { format: "esm", outdir: "dist/test/client/unit" });
  esbuild("src/test/client/e2e/index.ts", { format: "esm", outdir: "dist/test/client/e2e" });
  console.log("✓ Built test utilities to dist/test/");
}

function generateTypes() {
  // Core type bundles
  execSync(`npx dts-bundle-generator -o dist/types/index.d.ts src/index.ts ${DTS_FLAGS}`, { stdio: "inherit" });
  execSync(`npx dts-bundle-generator -o dist/types/server.d.ts src/core/server/index.ts ${DTS_FLAGS}`, { stdio: "inherit" });

  // Prepend reference to typebox module augmentation so consumers get NRG schema extensions
  const serverDts = readFileSync("dist/types/server.d.ts", "utf-8");
  writeFileSync("dist/types/server.d.ts", `/// <reference path="./shims/typebox.d.ts" />\n${serverDts}`);

  // Client types — generated from interfaces only. Function declarations are
  // appended because registration.ts imports .vue files that dts-bundle-generator
  // can't process.
  execSync(`npx dts-bundle-generator -o dist/types/client.d.ts src/core/client/types.ts ${DTS_FLAGS}`, { stdio: "inherit" });
  appendFileSync("dist/types/client.d.ts", `
export declare function defineNode<T extends NodeDefinition>(options: T): T;
export declare function registerType(definition: NodeDefinition): Promise<void>;
export declare function registerTypes(nodes: NodeDefinition[]): Promise<void>;
export declare function useFormNode<TConfig extends TSchema = TSchema, TCredentials extends TSchema = TSchema>(): {
  node: NodeRedNode & Infer<TConfig> & { credentials: Infer<TCredentials> & Record<string, any> };
  schema: Record<string, any>;
  errors: Record<string, string>;
};
`);

  // Vite types — the nrg() return type (Plugin[]) crashes dts-bundle-generator,
  // so we generate from the options interface and append the function signature.
  execSync(`npx dts-bundle-generator -o dist/types/vite.d.ts src/vite/types.ts ${DTS_FLAGS}`, { stdio: "inherit" });
  appendFileSync("dist/types/vite.d.ts", `
import type { Plugin } from "vite";
export declare function nrg(options?: NrgPluginOptions): Plugin[];
`);

  // Test utilities types
  execSync(`npx dts-bundle-generator -o dist/types/test-server-unit.d.ts src/test/server/unit/index.ts ${DTS_FLAGS} --external-types vitest`, { stdio: "inherit" });
  execSync(`npx dts-bundle-generator -o dist/types/test-server-integration.d.ts src/test/server/integration/index.ts ${DTS_FLAGS}`, { stdio: "inherit" });
  execSync(`npx dts-bundle-generator -o dist/types/test-client-component.d.ts src/test/client/component/types.ts ${DTS_FLAGS}`, { stdio: "inherit" });
  execSync(`npx dts-bundle-generator -o dist/types/test-client-unit.d.ts src/test/client/unit/index.ts ${DTS_FLAGS} --external-types vitest`, { stdio: "inherit" });
  execSync(`npx dts-bundle-generator -o dist/types/test-client-e2e.d.ts src/test/client/e2e/index.ts ${DTS_FLAGS} --external-imports playwright --external-imports playwright-core`, { stdio: "inherit" });

  console.log("✓ Generated type declarations to dist/types/");
}

function generateComponentTypes() {
  // Emit .vue.d.ts declarations for each component via vue-tsc.
  // rootDir spans src/core (not just form/components): tsc emits a declaration
  // for every non-declaration file in the program, and files outside rootDir
  // land beside their source instead of under outDir. Mirroring src/core under
  // shims/ also keeps the relative imports inside the emitted files resolvable
  // (client/form/components → ../../types → shims/client/types.d.ts).
  execSync("npx vue-tsc -p build/tsconfig.vue-dts.json", { stdio: "inherit" });

  // Post-process vue-tsc output: inline the type to remove the
  // `typeof __VLS_export` indirection that Volar can't resolve in consumers,
  // keeping the preamble (imports and local type declarations) the inlined
  // type still references.
  const componentsDir = "dist/types/shims/client/form/components";
  const vueFiles = readdirSync(componentsDir).filter((f) => f.endsWith(".vue.d.ts"));

  for (const file of vueFiles) {
    const filePath = path.join(componentsDir, file);
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(
      /declare const _default: typeof __VLS_export;\s*export default _default;\s*declare const __VLS_export:\s*([\s\S]+)$/
    );
    if (!match) {
      throw new Error(
        `Unexpected vue-tsc declaration shape in ${filePath} — update the __VLS_export post-processing in generateComponentTypes()`,
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
    return `    ${componentName}: (typeof import("./client/form/components/${baseName}.vue"))["default"];`;
  });

  const componentsDts = `/**
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
`;

  writeFileSync("dist/types/shims/components.d.ts", componentsDts);
  console.log("✓ Generated component type declarations to dist/types/shims/");
}

function copyAssets() {
  mkdirSync("dist/tsconfig", { recursive: true });
  cpSync("src/tsconfig", "dist/tsconfig", { recursive: true });

  mkdirSync("dist/types/shims/client", { recursive: true });
  copyFileSync("src/core/client/shims-vue.d.ts", "dist/types/shims/shims-vue.d.ts");
  // mirrors its source location so its ../constants import resolves to the
  // vue-tsc-emitted shims/constants.d.ts
  copyFileSync("src/core/client/globals.d.ts", "dist/types/shims/client/globals.d.ts");

  copyFileSync("src/core/server/typebox.d.ts", "dist/types/shims/typebox.d.ts");
  // canonical vocabulary lives at the core root; the copy lands next to
  // typebox.d.ts which imports it as ./schema-options
  copyFileSync("src/core/schema-options.ts", "dist/types/shims/schema-options.d.ts");

  cpSync("src/schemas", "dist/schemas", { recursive: true });

  if (existsSync("README.md")) {
    copyFileSync("README.md", "dist/README.md");
  }

  if (existsSync("LICENSE")) {
    copyFileSync("LICENSE", "dist/LICENSE");
  }

  console.log(
    "✓ Copied tsconfigs, shims, schemas, README, and LICENSE to dist/",
  );
}

function generatePackageJson() {
  const rootPkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const distPkg = {
    name: rootPkg.name,
    version: rootPkg.version,
    description: rootPkg.description,
    author: rootPkg.author,
    license: rootPkg.license,
    type: rootPkg.type,
    homepage: rootPkg.homepage,
    bugs: rootPkg.bugs,
    repository: rootPkg.repository,
    publishConfig: rootPkg.publishConfig,
    engines: rootPkg.engines,
    keywords: rootPkg.keywords,
    exports: {
      ".": {
        types: "./types/index.d.ts",
        default: "./index.js",
      },
      "./server": {
        types: "./types/server.d.ts",
        require: "./server/index.cjs",
        default: "./server/index.cjs",
      },
      "./client": {
        types: "./types/client.d.ts",
      },
      "./vite": {
        types: "./types/vite.d.ts",
        default: "./vite/index.js",
      },
      "./test/server/unit": {
        types: "./types/test-server-unit.d.ts",
        default: "./test/server/unit/index.js",
      },
      "./test/server/unit/config": "./test/server/unit/config.js",
      "./test/server/integration": {
        types: "./types/test-server-integration.d.ts",
        default: "./test/server/integration/index.js",
      },
      "./test/server/integration/config": "./test/server/integration/config.js",
      "./test/client/component": {
        types: "./types/test-client-component.d.ts",
        default: "./test/client/component/index.js",
      },
      "./test/client/component/config": "./test/client/component/config.js",
      "./test/client/component/setup": "./test/client/component/setup.js",
      "./test/client/unit": {
        types: "./types/test-client-unit.d.ts",
        default: "./test/client/unit/index.js",
      },
      "./test/client/unit/config": "./test/client/unit/config.js",
      "./test/client/unit/setup": "./test/client/unit/setup.js",
      "./test/client/e2e": {
        types: "./types/test-client-e2e.d.ts",
        default: "./test/client/e2e/index.js",
      },
      "./tsconfig/base.json": "./tsconfig/base.json",
      "./tsconfig/core/server.json": "./tsconfig/core/server.json",
      "./tsconfig/core/client.json": "./tsconfig/core/client.json",
      "./tsconfig/test/server/unit.json": "./tsconfig/test/server/unit.json",
      "./tsconfig/test/server/integration.json": "./tsconfig/test/server/integration.json",
      "./tsconfig/test/client/component.json": "./tsconfig/test/client/component.json",
      "./tsconfig/test/client/unit.json": "./tsconfig/test/client/unit.json",
      "./tsconfig/test/client/e2e.json": "./tsconfig/test/client/e2e.json",
    },
    peerDependencies: rootPkg.peerDependencies,
    peerDependenciesMeta: rootPkg.peerDependenciesMeta,
    dependencies: {
      ...collectBundleDeps(listBundles(DIST), rootPkg),
      "@bonsae/nrg-runtime": `^${rootPkg.version}`,
    },
  };
  writeFileSync("dist/package.json", JSON.stringify(distPkg, null, 2) + "\n");
  console.log("✓ Generated dist/package.json");
}

// ---------------------------------------------------------------------------
// Two-package split: @bonsae/nrg (toolkit) + @bonsae/nrg-runtime (runtime)
// ---------------------------------------------------------------------------

/** Built JS/CJS bundles under a dir (skips type decls and served assets). */
function listBundles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === "types" || e.name === "resources") continue;
      out.push(...listBundles(path.join(dir, e.name)));
    } else if (e.name.endsWith(".js") || e.name.endsWith(".cjs")) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Bare-import package names used by the given bundles that are declared deps. */
function collectBundleDeps(
  files: string[],
  rootPkg: { dependencies?: Record<string, string> },
): Record<string, string> {
  const sourceDeps = rootPkg.dependencies ?? {};
  const out: Record<string, string> = {};
  const re = /(?:require\(|import\(|from|import)\s*["']([^"']+)["']/g;
  for (const file of files) {
    const code = readFileSync(file, "utf-8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const spec = m[1]!;
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      const pkg = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0]!;
      if (sourceDeps[pkg]) out[pkg] = sourceDeps[pkg];
    }
  }
  return out;
}

/**
 * Emit @bonsae/nrg-runtime by reusing the already-built server bundle, client
 * asset, and types. This is the only nrg package a built node depends on at
 * runtime; its deps are scanned from the server bundle (+ vue, which api/assets
 * serves rather than imports), so no build/dev/test tooling reaches the
 * container.
 */
function buildRuntimePackage() {
  mkdirSync(DIST_RUNTIME, { recursive: true });
  copyFileSync(
    path.join(DIST, "server/index.cjs"),
    path.join(DIST_RUNTIME, "index.cjs"),
  );
  cpSync(
    path.join(DIST, "server/resources"),
    path.join(DIST_RUNTIME, "resources"),
    { recursive: true },
  );
  // Only the runtime types — server/client + the shims they reference. (A full
  // copy would drag in the toolkit's index/vite/test type bundles.)
  mkdirSync(path.join(DIST_RUNTIME, "types"), { recursive: true });
  copyFileSync(
    path.join(DIST, "types/server.d.ts"),
    path.join(DIST_RUNTIME, "types/server.d.ts"),
  );
  copyFileSync(
    path.join(DIST, "types/client.d.ts"),
    path.join(DIST_RUNTIME, "types/client.d.ts"),
  );
  cpSync(path.join(DIST, "types/shims"), path.join(DIST_RUNTIME, "types/shims"), {
    recursive: true,
  });

  const rootPkg = JSON.parse(
    readFileSync(path.resolve(ROOT, "package.json"), "utf-8"),
  );
  const deps = collectBundleDeps(
    [path.join(DIST_RUNTIME, "index.cjs")],
    rootPkg,
  );
  if (rootPkg.dependencies?.vue) deps.vue = rootPkg.dependencies.vue;

  const runtimePkg = {
    name: "@bonsae/nrg-runtime",
    version: rootPkg.version,
    description:
      "Runtime for Node-RED nodes built with @bonsae/nrg — no build tooling.",
    author: rootPkg.author,
    license: rootPkg.license,
    type: "commonjs",
    homepage: rootPkg.homepage,
    bugs: rootPkg.bugs,
    repository: rootPkg.repository,
    publishConfig: rootPkg.publishConfig,
    engines: rootPkg.engines,
    keywords: rootPkg.keywords,
    files: ["index.cjs", "resources", "types"],
    exports: {
      "./server": {
        types: "./types/server.d.ts",
        require: "./index.cjs",
        default: "./index.cjs",
      },
      "./client": { types: "./types/client.d.ts" },
    },
    dependencies: deps,
  };
  writeFileSync(
    path.join(DIST_RUNTIME, "package.json"),
    JSON.stringify(runtimePkg, null, 2) + "\n",
  );
  if (existsSync("README.md"))
    copyFileSync("README.md", path.join(DIST_RUNTIME, "README.md"));
  if (existsSync("LICENSE"))
    copyFileSync("LICENSE", path.join(DIST_RUNTIME, "LICENSE"));
  console.log("✓ Generated @bonsae/nrg-runtime in dist-runtime/");
}

/**
 * Convert dist/ (the @bonsae/nrg toolkit) so its server/client entries
 * re-export @bonsae/nrg-runtime — single source of truth, and the toolkit
 * sheds the runtime deps. Runs after buildRuntimePackage has captured the real
 * server bundle, client asset, and types.
 */
function finalizeToolkit() {
  rmSync(path.join(DIST, "server/resources"), { recursive: true, force: true });
  writeFileSync(
    path.join(DIST, "server/index.cjs"),
    `'use strict';\nmodule.exports = require("@bonsae/nrg-runtime/server");\n`,
  );
  writeFileSync(
    path.join(DIST, "types/server.d.ts"),
    `export * from "@bonsae/nrg-runtime/server";\n`,
  );
  writeFileSync(
    path.join(DIST, "types/client.d.ts"),
    `export * from "@bonsae/nrg-runtime/client";\n`,
  );
  console.log(
    "✓ Finalized @bonsae/nrg toolkit (server/client re-export the runtime)",
  );
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

clean();
buildServer();
await buildClient();
buildRootEntry();
buildVitePlugin();
await buildTestUtils();
generateTypes();
copyAssets();
generateComponentTypes();
buildRuntimePackage();
finalizeToolkit();
generatePackageJson();
