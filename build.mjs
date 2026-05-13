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

const DIST = path.resolve(__dirname, "dist");
const DTS_FLAGS =
  "--no-check --project tsconfig.build.json --export-referenced-types=false";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esbuild(entry, { format, platform = "node", outfile, outdir }) {
  const out = outfile ? `--outfile=${outfile}` : `--outdir=${outdir}`;
  execSync(
    `esbuild ${entry} --bundle --packages=external --format=${format} --platform=${platform} ${out}`,
    { stdio: "inherit" },
  );
}

// ---------------------------------------------------------------------------
// Build phases
// ---------------------------------------------------------------------------

function clean() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  console.log("✓ Cleaned dist/");
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

function buildTestUtils() {
  esbuild("src/test/index.ts", { format: "esm", outdir: "dist/test" });
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
`);

  // Vite types — the nodeRed() return type (Plugin[]) crashes dts-bundle-generator,
  // so we generate from the options interface and append the function signature.
  execSync(`npx dts-bundle-generator -o dist/types/vite.d.ts src/vite/types.ts ${DTS_FLAGS}`, { stdio: "inherit" });
  appendFileSync("dist/types/vite.d.ts", `
import type { Plugin } from "vite";
export declare function nodeRed(options?: NodeRedPluginOptions): Plugin[];
`);

  // Test utilities types
  execSync(`npx dts-bundle-generator -o dist/types/test.d.ts src/test/index.ts ${DTS_FLAGS} --external-types vitest`, { stdio: "inherit" });

  console.log("✓ Generated type declarations to dist/types/");
}

function generateComponentTypes() {
  // Emit .vue.d.ts declarations for each component via vue-tsc.
  // Some components use non-reactive instance properties (this.$input, this.editorInstance)
  // that vue-tsc reports as errors, but noEmitOnError:false still emits correct declarations.
  try {
    execSync("npx vue-tsc -p tsconfig.components.json", { stdio: "inherit" });
  } catch {
    // vue-tsc exits non-zero on type errors even with noEmitOnError:false
  }

  // Post-process vue-tsc output: inline the type to remove the
  // `typeof __VLS_export` indirection that Volar can't resolve in consumers.
  const componentsDir = "dist/types/shims/form/components";
  const vueFiles = readdirSync(componentsDir).filter((f) => f.endsWith(".vue.d.ts"));

  for (const file of vueFiles) {
    const filePath = path.join(componentsDir, file);
    let content = readFileSync(filePath, "utf-8");
    const match = content.match(
      /declare const __VLS_export:\s*([\s\S]+)$/
    );
    if (match) {
      const actualType = match[1].trimEnd().replace(/;$/, "");
      content = `declare const _default: ${actualType};\nexport default _default;\n`;
      writeFileSync(filePath, content);
    }
  }

  const entries = vueFiles.map((file) => {
    const baseName = file.replace(".vue.d.ts", "");
    const componentName = baseName
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    return `    ${componentName}: (typeof import("./form/components/${baseName}.vue"))["default"];`;
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

  mkdirSync("dist/types/shims", { recursive: true });
  copyFileSync("src/core/client/shims-vue.d.ts", "dist/types/shims/shims-vue.d.ts");
  copyFileSync("src/core/client/globals.d.ts", "dist/types/shims/globals.d.ts");

  copyFileSync("src/core/server/typebox.d.ts", "dist/types/shims/typebox.d.ts");
  copyFileSync("src/core/server/schema-options.ts", "dist/types/shims/schema-options.d.ts");

  cpSync("src/schemas", "dist/schemas", { recursive: true });

  if (existsSync("README.md")) {
    copyFileSync("README.md", "dist/README.md");
  }

  console.log("✓ Copied tsconfigs, shims, schemas, and README to dist/");
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
      "./test": {
        types: "./types/test.d.ts",
        default: "./test/index.js",
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
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

clean();
buildServer();
await buildClient();
buildRootEntry();
buildVitePlugin();
buildTestUtils();
generateTypes();
copyAssets();
generateComponentTypes();
generatePackageJson();
