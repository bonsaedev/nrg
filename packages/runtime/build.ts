import { execSync } from "child_process";
import {
  mkdirSync,
  copyFileSync,
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
  clean,
  inlineCss,
} from "../../scripts/build-lib";

// Runs with cwd = packages/runtime (pnpm --filter @bonsae/nrg-runtime build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const WORKSPACE_ROOT = path.resolve(ROOT, "../..");
const DIST = path.resolve(ROOT, "dist");

const COMPONENTS = [
  "NodeRedInput",
  "NodeRedTypedInput",
  "NodeRedConfigInput",
  "NodeRedSelectInput",
  "NodeRedEditorInput",
  "NodeRedInputLabel",
  "NodeRedToggle",
  "NodeRedJsonSchemaForm",
];

function buildServer() {
  esbuildBundle("src/server/index.ts", {
    format: "cjs",
    outfile: "dist/server/index.cjs",
  });
  console.log("✓ Built server → dist/server/index.cjs");
}

function buildInternal() {
  esbuildBundle("src/internal.ts", {
    format: "cjs",
    outfile: "dist/internal/index.cjs",
  });
  console.log("✓ Built internal (Node) → dist/internal/index.cjs");
}

async function buildClientAsset() {
  // The editor client runtime, served as a static asset; vue is externalized to
  // the URL the editor loads it from.
  await viteBuild({
    configFile: false,
    logLevel: "warn",
    plugins: [vue()],
    build: {
      outDir: path.join(DIST, "server/resources"),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(ROOT, "src/client/index.ts"),
        name: "NrgClient",
        // Force .js (not .mjs) — this is a static asset the editor loads from a
        // URL; the package being type:commonjs would otherwise make vite emit
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
  // Inline extracted CSS into nrg-client.js so styles load with the script.
  inlineCss(path.join(DIST, "server/resources"), "nrg-client.js");
  console.log("✓ Built client asset → dist/server/resources/nrg-client.js");
}

async function buildInternalComponents() {
  // The real form components, for the component test harness. vue stays external
  // as a bare specifier so the consumer's test env supplies it; everything else
  // (es-toolkit, etc.) is bundled in so the runtime declares no extra deps.
  await viteBuild({
    configFile: false,
    logLevel: "warn",
    plugins: [vue()],
    build: {
      outDir: path.join(DIST, "internal"),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(ROOT, "src/internal-components.ts"),
        name: "NrgComponents",
        fileName: () => "components.mjs",
        formats: ["es"],
      },
      rollupOptions: { external: ["vue"] },
    },
  });
  // Inline the components' extracted CSS into components.mjs so the test harness
  // mounts them styled (and nothing stray is shipped).
  inlineCss(path.join(DIST, "internal"), "components.mjs", { guard: true });
  // Client validation helpers + useFormNode (no .vue), vue external. Named .mjs
  // so Node treats it as ESM in this type:commonjs package.
  esbuildBundle("src/internal-client.ts", {
    format: "esm",
    outfile: "dist/internal/client.mjs",
  });
  console.log(
    "✓ Built internal client → dist/internal/{client,components}.mjs",
  );
}

function generateTypes() {
  execSync(
    `npx dts-bundle-generator -o dist/types/server.d.ts src/server/index.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );
  const serverDts = readFileSync("dist/types/server.d.ts", "utf-8");
  writeFileSync(
    "dist/types/server.d.ts",
    `/// <reference path="./shims/typebox.d.ts" />\n${serverDts}`,
  );

  execSync(
    `npx dts-bundle-generator -o dist/types/client.d.ts src/client/types.ts ${DTS_FLAGS}`,
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

  // Node-side test-support internals (no .vue) — declaration-emittable.
  execSync(
    `npx dts-bundle-generator -o dist/types/internal.d.ts src/internal.ts ${DTS_FLAGS}`,
    { stdio: "inherit" },
  );

  // Client test-support internals reach .vue/composables that
  // dts-bundle-generator can't process, so hand-author a loose-but-usable
  // declaration (these are framework-internal test helpers, not public API).
  writeFileSync(
    "dist/types/internal-client.d.ts",
    `import type { TSchema } from "@sinclair/typebox";
export declare function useFormNode<TConfig extends TSchema = TSchema, TCredentials extends TSchema = TSchema>(): {
  node: Record<string, any>;
  schema: Record<string, any>;
  errors: Record<string, string>;
};
export declare function validateForm(schema: unknown, value: unknown): Record<string, string>;
export declare function composeValidationSchema(...schemas: unknown[]): unknown;
export type JsonSchemaObject = Record<string, any>;
`,
  );
  writeFileSync(
    "dist/types/internal-components.d.ts",
    `import type { DefineComponent } from "vue";
${COMPONENTS.map((c) => `export declare const ${c}: DefineComponent<{}, {}, any>;`).join("\n")}
`,
  );

  console.log("✓ Generated type declarations → dist/types/");
}

function generateComponentTypes() {
  execSync("npx vue-tsc -p tsconfig.vue-dts.json", { stdio: "inherit" });

  const componentsDir = "dist/types/shims/client/form/components";
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
    return `    ${componentName}: (typeof import("./client/form/components/${baseName}.vue"))["default"];`;
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

function copyShims() {
  mkdirSync("dist/types/shims/client", { recursive: true });
  copyFileSync("src/client/shims-vue.d.ts", "dist/types/shims/shims-vue.d.ts");
  copyFileSync(
    "src/client/globals.d.ts",
    "dist/types/shims/client/globals.d.ts",
  );
  copyFileSync("src/server/typebox.d.ts", "dist/types/shims/typebox.d.ts");
  copyFileSync("src/schema-options.ts", "dist/types/shims/schema-options.d.ts");

  // README.md is committed per-package (runtime-specific); only LICENSE is
  // shared from the workspace root.
  for (const f of ["LICENSE"]) {
    const src = path.join(WORKSPACE_ROOT, f);
    if (existsSync(src)) copyFileSync(src, path.join(ROOT, f));
  }
  console.log("✓ Copied shims and LICENSE");
}

async function main() {
  clean(DIST);
  buildServer();
  buildInternal();
  await buildClientAsset();
  await buildInternalComponents();
  generateTypes();
  copyShims();
  generateComponentTypes();
  console.log("✓ @bonsae/nrg-runtime built");
}

main();
