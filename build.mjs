import { execSync } from "child_process";
import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
execSync(
  "esbuild src/test/index.ts --bundle --packages=external --format=esm --platform=node --outdir=dist/test",
  { stdio: "inherit" },
);
console.log("✓ Built test utilities to dist/test/");

// Phase 6: Generate bundled type declarations
const dtsFlags = "--no-check --project tsconfig.build.json --external-inlines @sinclair/typebox";
execSync(`npx dts-bundle-generator -o dist/types/index.d.ts src/index.ts ${dtsFlags}`, { stdio: "inherit" });
execSync(`npx dts-bundle-generator -o dist/types/server.d.ts src/core/server/index.ts ${dtsFlags}`, { stdio: "inherit" });
// Client types are written manually because dts-bundle-generator can't handle .vue imports
writeFileSync("dist/types/client.d.ts", `
import type { Component } from "vue";

export interface NodeButtonDefinition {
  toggle: string;
  onclick: () => void;
  enabled?: () => boolean;
  visible?: () => boolean;
}

export interface NodeFormDefinition {
  component?: Component;
}

export interface NodeDefinition {
  type: string;
  category?: string;
  color?: string;
  icon?: ((this: any) => string) | string;
  label?: ((this: any) => string) | string;
  inputs?: number;
  outputs?: number;
  paletteLabel?: ((this: any) => string) | string;
  labelStyle?: ((this: any) => string) | string;
  inputLabels?: ((this: any) => string) | string;
  outputLabels?: ((this: any) => string) | string;
  align?: "left" | "right";
  button?: NodeButtonDefinition;
  onEditResize?: (this: any, size: { width: number; height: number }) => void;
  onPaletteAdd?: (this: any) => void;
  onPaletteRemove?: (this: any) => void;
  form?: NodeFormDefinition;
}

export declare function defineNode<T extends NodeDefinition>(options: T): T;
export declare function registerType(definition: NodeDefinition): Promise<void>;
export declare function registerTypes(nodes: NodeDefinition[]): Promise<void>;
`);
console.log("✓ Generated client types (manual)");
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
// Test utilities types
writeFileSync("dist/types/test.d.ts", `
export interface CreateNodeOptions {
  config?: Record<string, any>;
  credentials?: Record<string, any>;
  configNodes?: Record<string, any>;
  settings?: Record<string, any>;
  overrides?: Record<string, any>;
}

type ExtractInput<T> = T extends { input(msg: infer I): any } ? I : any;
type ExtractOutput<T> = T extends { send(msg: infer O): any } ? O : any;

export interface TestNodeHelpers<TInput = any, TOutput = any> {
  receive(msg: TInput): Promise<void>;
  close(removed?: boolean): Promise<void>;
  reset(): void;
  sent(): TOutput[];
  sent(port: number): any[];
  statuses(): any[];
  logged(level?: "info" | "warn" | "error" | "debug"): string[];
  warned(): string[];
  errored(): string[];
}

export interface CreateNodeResult<T> {
  node: T & TestNodeHelpers<ExtractInput<T>, ExtractOutput<T>>;
  RED: any;
}

interface NodeClass {
  readonly type: string;
  readonly category?: string;
  readonly configSchema?: any;
  registered?(RED: any): void | Promise<void>;
  _registered?(RED: any): void | Promise<void>;
  new (...args: any[]): any;
}

export declare function createNode<T extends NodeClass>(NodeClass: T, options?: CreateNodeOptions): Promise<CreateNodeResult<InstanceType<T>>>;
`);
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
