import { execSync } from "child_process";
import {
  mkdirSync,
  copyFileSync,
  cpSync,
  readFileSync,
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
  "--no-check --project tsconfig.build.json --external-inlines @sinclair/typebox";

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

function extractInterfaceBody(source, interfaceName) {
  const start = source.indexOf(`interface ${interfaceName} {`);
  const bodyStart = source.indexOf("{", start) + 1;
  let braceCount = 1;
  let i = bodyStart;
  while (braceCount > 0 && i < source.length) {
    if (source[i] === "{") braceCount++;
    if (source[i] === "}") braceCount--;
    i++;
  }
  return source.slice(bodyStart, i - 1);
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

  // Inject NRG schema extensions into the inlined SchemaOptions interface.
  // Because typebox is inlined (--external-inlines), its SchemaOptions interface
  // becomes a local declaration disconnected from the real module. The module
  // augmentation in src/core/server/typebox.d.ts doesn't reach consumers, so we
  // inject the properties directly. Source of truth: src/core/server/schema-options.ts
  const serverDts = readFileSync("dist/types/server.d.ts", "utf-8");
  const schemaOpts = readFileSync("src/core/server/schema-options.ts", "utf-8");
  const shimProps = extractInterfaceBody(schemaOpts, "NrgSchemaExtensions");
  writeFileSync(
    "dist/types/server.d.ts",
    serverDts.replace(/(export interface SchemaOptions \{)/, `$1${shimProps}`),
  );

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

function copyAssets() {
  mkdirSync("dist/tsconfig", { recursive: true });
  cpSync("src/tsconfig", "dist/tsconfig", { recursive: true });

  mkdirSync("dist/types/shims", { recursive: true });
  copyFileSync("src/core/client/shims-vue.d.ts", "dist/types/shims/shims-vue.d.ts");
  copyFileSync("src/core/client/components.d.ts", "dist/types/shims/components.d.ts");
  copyFileSync("src/core/client/globals.d.ts", "dist/types/shims/globals.d.ts");

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
generatePackageJson();
