import { execSync } from "child_process";
import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Phase 0: Clean dist
import { rmSync } from "fs";
if (existsSync("dist")) rmSync("dist", { recursive: true });

// Phase 1: Build server (CJS)
execSync(
  "esbuild src/core/server/index.ts --bundle --packages=external --format=cjs --platform=node --outfile=dist/server/index.cjs",
  { stdio: "inherit" },
);
console.log("✓ Built server to dist/server/");

// Phase 2: Copy Vue runtime
mkdirSync("dist/server/resources", { recursive: true });

const vueProdFile = require.resolve("vue/dist/vue.esm-browser.prod.js");
const vueDevFile = require.resolve("vue/dist/vue.esm-browser.js");
copyFileSync(vueProdFile, path.resolve(__dirname, "dist/server/resources/vue.esm-browser.prod.js"));
copyFileSync(vueDevFile, path.resolve(__dirname, "dist/server/resources/vue.esm-browser.js"));
console.log("✓ Copied Vue runtimes (dev + prod) to dist/server/resources/");

// Phase 3: Build client (ESM library)
await viteBuild({
  configFile: false,
  logLevel: "warn",
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, "dist/server/resources"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/core/client/index.ts"),
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

// Inline the extracted CSS into nrg-client.js so styles are injected when the script loads
const cssPath = path.resolve(__dirname, "dist/server/resources/nrg-client.css");
if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, "utf-8");
  const jsPath = path.resolve(__dirname, "dist/server/resources/nrg-client.js");
  const js = readFileSync(jsPath, "utf-8");
  const inject = `(function(){var s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n`;
  writeFileSync(jsPath, inject + js);
  unlinkSync(cssPath);
  console.log("✓ Inlined nrg-client.css into nrg-client.js");
}

// Phase 4: Build root entry (ESM)
execSync(
  "esbuild src/index.ts --bundle --packages=external --format=esm --platform=node --outfile=dist/index.js",
  { stdio: "inherit" },
);
console.log("✓ Built root entry to dist/index.js");

// Phase 5: Build vite plugin (ESM)
execSync(
  "esbuild src/vite/index.ts --bundle --packages=external --format=esm --platform=node --outdir=dist/vite",
  { stdio: "inherit" },
);
console.log("✓ Built vite plugin to dist/vite/");

// Phase 5b: Build test utilities (ESM)
// The validator now lives on the RED object (set by initValidator), so bundling the
// validation module into the test bundle is safe — there is no singleton to duplicate.
execSync(
  "esbuild src/test/index.ts --bundle --packages=external --format=esm --platform=node --outdir=dist/test",
  { stdio: "inherit" },
);
console.log("✓ Built test utilities to dist/test/");

// Phase 6: Generate bundled type declarations
const dtsFlags = "--no-check --project tsconfig.build.json --external-inlines @sinclair/typebox";
execSync(`npx dts-bundle-generator -o dist/types/index.d.ts src/index.ts ${dtsFlags}`, { stdio: "inherit" });
execSync(`npx dts-bundle-generator -o dist/types/server.d.ts src/core/server/index.ts ${dtsFlags}`, { stdio: "inherit" });
// Because typebox is inlined (--external-inlines), its SchemaOptions interface becomes a local
// declaration in server.d.ts, disconnected from the real @sinclair/typebox module. This means
// the module augmentation in src/core/server/typebox.d.ts (which works for local development)
// doesn't reach consumers. To give consumers autocomplete for nrg-specific schema options
// (x-nrg-form, exportable, etc.), we inject those properties directly into the inlined
// SchemaOptions interface. Source of truth: src/core/server/schema-options.ts
const serverDts = readFileSync("dist/types/server.d.ts", "utf-8");
const schemaOpts = readFileSync("src/core/server/schema-options.ts", "utf-8");
const soStart = schemaOpts.indexOf("interface NrgSchemaExtensions {");
const soBodyStart = schemaOpts.indexOf("{", soStart) + 1;
let braceCount = 1;
let soBodyEnd = soBodyStart;
while (braceCount > 0 && soBodyEnd < schemaOpts.length) {
  if (schemaOpts[soBodyEnd] === "{") braceCount++;
  if (schemaOpts[soBodyEnd] === "}") braceCount--;
  soBodyEnd++;
}
const shimProps = schemaOpts.slice(soBodyStart, soBodyEnd - 1);
writeFileSync("dist/types/server.d.ts", serverDts.replace(
  /(export interface SchemaOptions \{)/,
  `$1${shimProps}`
));
// Client types — generated from src/core/client/types.ts (interfaces).
// Function declarations are appended because registration.ts imports from the
// app module which contains .vue files that dts-bundle-generator can't process.
execSync(`npx dts-bundle-generator -o dist/types/client.d.ts src/core/client/types.ts ${dtsFlags}`, { stdio: "inherit" });
appendFileSync("dist/types/client.d.ts", `
export declare function defineNode<T extends NodeDefinition>(options: T): T;
export declare function registerType(definition: NodeDefinition): Promise<void>;
export declare function registerTypes(nodes: NodeDefinition[]): Promise<void>;
`);
console.log("✓ Generated client types");
// Vite types are written manually because the vite plugin code has loose typing
writeFileSync("dist/types/vite.d.ts", `
import type { Plugin } from "vite";

export interface NodeRedPluginOptions {
  outDir?: string;
  serverBuildOptions?: Record<string, any>;
  clientBuildOptions?: Record<string, any>;
  nodeRedLauncherOptions?: Record<string, any>;
  extraFilesCopyTargets?: Array<{ src: string; dest: string }>;
}

export declare function nodeRed(options?: NodeRedPluginOptions): Plugin[];
`);
// Test utilities types — generated from source
execSync(`npx dts-bundle-generator -o dist/types/test.d.ts src/test/index.ts ${dtsFlags} --external-types vitest`, { stdio: "inherit" });
console.log("✓ Generated type declarations to dist/types/");

// Phase 7: Copy shared tsconfigs and client shims
mkdirSync("dist/tsconfig", { recursive: true });
cpSync("src/tsconfig", "dist/tsconfig", { recursive: true });
mkdirSync("dist/types/shims", { recursive: true });
copyFileSync("src/core/client/shims-vue.d.ts", "dist/types/shims/shims-vue.d.ts");
copyFileSync("src/core/client/components.d.ts", "dist/types/shims/components.d.ts");
copyFileSync("src/core/client/globals.d.ts", "dist/types/shims/globals.d.ts");
cpSync("src/schemas", "dist/schemas", { recursive: true });
console.log("✓ Copied tsconfigs, shims, and schemas to dist/");

// Phase 8: Generate publish-ready package.json in dist/
const rootPkg = JSON.parse(readFileSync("package.json", "utf-8"));
const distPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  author: rootPkg.author,
  license: rootPkg.license,
  type: rootPkg.type,
  repository: rootPkg.repository,
  publishConfig: rootPkg.publishConfig,
  engines: rootPkg.engines,
  keywords: rootPkg.keywords,
  exports: {
    ".": {
      "types": "./types/index.d.ts",
      "default": "./index.js",
    },
    "./server": {
      "types": "./types/server.d.ts",
      "require": "./server/index.cjs",
      "default": "./server/index.cjs",
    },
    "./client": {
      "types": "./types/client.d.ts",
    },
    "./vite": {
      "types": "./types/vite.d.ts",
      "default": "./vite/index.js",
    },
    "./test": {
      "types": "./types/test.d.ts",
      "default": "./test/index.js",
    },
    "./tsconfig/base.json": "./tsconfig/base.json",
    "./tsconfig/client.json": "./tsconfig/client.json",
    "./tsconfig/server.json": "./tsconfig/server.json",
  },
  peerDependencies: rootPkg.peerDependencies,
  dependencies: rootPkg.dependencies,
};
writeFileSync("dist/package.json", JSON.stringify(distPkg, null, 2) + "\n");
console.log("✓ Generated dist/package.json");

// Copy README into dist/ for npm (LICENSE/CHANGELOG are included automatically)
if (existsSync("README.md")) {
  copyFileSync("README.md", "dist/README.md");
}
console.log("✓ Copied README to dist/");
