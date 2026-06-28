import type { Plugin, InlineConfig } from "vite";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { BuildError } from "../errors";
import { logger } from "../logger";
import type { ClientBuildOptions, BuildContext, CopyTarget } from "../types";
import {
  helpGenerator,
  htmlGenerator,
  localesGenerator,
  minifier,
  nodeDefinitionsInliner,
  staticCopy,
} from "./plugins";

/**
 * Derives a stable, filesystem-safe cache subdirectory name from an output dir.
 * Keeps the basename for readability and appends a short hash of the absolute
 * path so distinct outDirs never share a cache directory.
 */
function cacheKeyFor(outDir: string): string {
  const abs = path.resolve(outDir);
  const hash = crypto.createHash("sha1").update(abs).digest("hex").slice(0, 8);
  return `${path.basename(abs) || "client"}-${hash}`;
}

async function build(
  clientBuildOptions: ClientBuildOptions,
  buildContext: BuildContext,
): Promise<void> {
  const {
    srcDir = "./client",
    entry = "index.ts",
    name = "NodeRedNodes",
    format = "es",
    licensePath = "./LICENSE",
    publicDir,
    external = [],
    globals = {},
    manualChunks,
  } = clientBuildOptions;

  // Resources convention: icons + locales are derived from src/resources/*.
  const resourcesDir = buildContext.resourcesDir;

  // Cache dir for generated entry/node-definition files. Keyed by output dir so
  // concurrent builds of the same project (e.g. `build` and `build:dev` writing
  // to different outDirs) don't clobber each other's generated files.
  const cacheDir = path.resolve(
    "node_modules",
    ".nrg",
    "client",
    cacheKeyFor(buildContext.outDir),
  );

  const physicalEntryPath = path.resolve(srcDir, entry);
  let entryPath: string;
  let generatedEntry = false;

  if (fs.existsSync(physicalEntryPath)) {
    entryPath = physicalEntryPath;
  } else {
    // No physical entry — create a minimal empty file in the cache directory
    // so the file watcher on srcDir is not triggered by the create/delete cycle.
    const cachedEntryPath = path.resolve(cacheDir, entry);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachedEntryPath, "// auto-generated entry\n");
    entryPath = cachedEntryPath;
    generatedEntry = true;
  }

  const iconsDir = path.join(resourcesDir, "icons");

  const plugins: Plugin[] = [
    vue(),
    nodeDefinitionsInliner(
      buildContext.outDir,
      entryPath,
      fs.existsSync(iconsDir) ? iconsDir : undefined,
      path.resolve(srcDir, "components"),
      path.resolve(srcDir, "nodes"),
      !generatedEntry,
      cacheDir,
    ),
  ];

  plugins.push(
    htmlGenerator({
      packageName: buildContext.packageName,
      licensePath: licensePath ? path.resolve(licensePath) : undefined,
    }),
  );

  const localesDir = path.join(resourcesDir, "locales");
  if (fs.existsSync(localesDir)) {
    const docsDir = path.join(localesDir, "docs");
    const labelsDir = path.join(localesDir, "labels");
    const localesOutDir = path.join(buildContext.outDir, "locales");

    plugins.push(
      localesGenerator({ outDir: localesOutDir, docsDir, labelsDir }),
    );

    // Generate help docs from schemas for nodes without manual docs.
    // Runs after localesGenerator and appends to the output.
    plugins.push(
      helpGenerator({
        outDir: buildContext.outDir,
        localesOutDir,
        docsDir,
        labelsDir,
        srcDir: buildContext.serverSrcDir,
      }),
    );
  }

  const copyTargets: CopyTarget[] = [];

  const resolvedPublicDir = path.resolve(
    publicDir ?? path.join(srcDir, "public"),
  );
  if (fs.existsSync(resolvedPublicDir)) {
    copyTargets.push({
      src: resolvedPublicDir,
      dest: path.join(buildContext.outDir, "resources"),
    });
  }

  if (fs.existsSync(iconsDir)) {
    copyTargets.push({
      src: iconsDir,
      dest: path.join(buildContext.outDir, "icons"),
    });
  }

  if (copyTargets.length > 0) {
    plugins.push(staticCopy({ targets: copyTargets }));
  }

  if (!buildContext.isDev && format === "es") {
    plugins.push(minifier());
  }

  // Intercept '@bonsae/nrg/client' before Vite's resolver so it stays external.
  // Rollup's string-array external check runs against the *resolved* file path,
  // which wouldn't match the original specifier. 'vue' is handled by the
  // external array directly (Vite keeps the bare specifier for known packages).
  plugins.unshift({
    name: "nrg-client-external",
    enforce: "pre",
    resolveId(id) {
      if (id === "@bonsae/nrg/client")
        return { id: "@bonsae/nrg/client", external: true };
    },
  } as Plugin);

  const defaultManualChunks = (id: string): string | undefined => {
    if (!id.includes("node_modules")) return undefined;

    const parts = id
      .substring(id.lastIndexOf("node_modules/") + "node_modules/".length)
      .split("/");

    const pkgName = parts[0].startsWith("@")
      ? `${parts[0]}/${parts[1]}`
      : parts[0];

    if (["jsonpointer", "es-toolkit"].includes(pkgName)) return "vendor-utils";
    return "vendor";
  };

  const config: InlineConfig = {
    configFile: false,
    logLevel: "warn",
    base: `/resources/${buildContext.packageName}`,
    publicDir: path.resolve(srcDir, "public"),
    resolve: {
      alias: {
        "@": path.resolve(srcDir),
      },
    },
    plugins,
    esbuild: {
      tsconfigRaw: "{}",
    },
    css: {
      devSourcemap: buildContext.isDev,
    },
    build: {
      outDir: buildContext.outDir,
      emptyOutDir: false,
      sourcemap: buildContext.isDev ? "inline" : false,
      minify: !buildContext.isDev && format !== "es",
      copyPublicDir: false,
      lib: {
        entry: entryPath,
        name,
        fileName: "index",
        formats: [format],
      },
      rollupOptions: {
        external,
        treeshake: false,
        output: {
          entryFileNames: "resources/index.[hash].js",
          chunkFileNames: "resources/vendor.[hash].js",
          assetFileNames: "resources/[name].[hash].[ext]",
          globals,
          paths: {
            vue: "/nrg/assets/vue.esm-browser.prod.js",
            "@bonsae/nrg/client": "/nrg/assets/nrg-client.js",
          },
          sourcemapPathTransform: (relativeSourcePath) => {
            return relativeSourcePath.replace(/\/client\//g, "/");
          },
          manualChunks: manualChunks ?? defaultManualChunks,
        },
      },
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        buildContext.isDev ? "development" : "production",
      ),
      "process.env": {},
    },
  };

  try {
    await viteBuild(config);
  } catch (error) {
    throw new BuildError("client", error as Error);
  } finally {
    if (generatedEntry) {
      if (fs.existsSync(entryPath)) {
        fs.unlinkSync(entryPath);
      }
    }
  }
}

export { build };
