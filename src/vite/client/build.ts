import type { Plugin, InlineConfig } from "vite";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "fs";
import path from "path";
import { BuildError } from "../errors";
import { logger } from "../logger";
import type { ClientBuildOptions, BuildContext, CopyTarget } from "../types";
import {
  htmlGenerator,
  localesGenerator,
  minifier,
  nodeDefinitionsInliner,
  staticCopy,
} from "./plugins";

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
    locales,
    staticDirs = {},
    external = ["jquery", "node-red", "vue"],
    globals = { jquery: "$", "node-red": "RED", vue: "Vue" },
    manualChunks,
    plugins: userPlugins = [],
  } = clientBuildOptions;

  const physicalEntryPath = path.resolve(srcDir, entry);
  let entryPath: string;
  let generatedEntry = false;

  if (fs.existsSync(physicalEntryPath)) {
    entryPath = physicalEntryPath;
  } else {
    // No physical entry — create a minimal empty file in the cache directory
    // so the file watcher on srcDir is not triggered by the create/delete cycle.
    const cacheDir = path.resolve("node_modules", ".nrg", "client");
    const cachedEntryPath = path.resolve(cacheDir, entry);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachedEntryPath, "// auto-generated entry\n");
    entryPath = cachedEntryPath;
    generatedEntry = true;
  }

  const iconsDir = path.resolve(
    staticDirs.icons ?? path.join(path.dirname(path.resolve(srcDir)), "icons"),
  );

  const plugins: Plugin[] = [
    vue(),
    nodeDefinitionsInliner(
      buildContext.outDir,
      entryPath,
      fs.existsSync(iconsDir) ? iconsDir : undefined,
      path.resolve(srcDir, "components"),
      path.resolve(srcDir, "nodes"),
      !generatedEntry,
    ),
    ...userPlugins,
  ];

  plugins.push(
    htmlGenerator({
      packageName: buildContext.packageName,
      licensePath: licensePath ? path.resolve(licensePath) : undefined,
    }),
  );

  if (locales) {
    const {
      docsDir = "./locales/docs",
      labelsDir = "./locales/labels",
      languages = [
        "en-US",
        "de",
        "es-ES",
        "fr",
        "ko",
        "pt-BR",
        "ru",
        "ja",
        "zh-CN",
        "zh-TW",
      ],
    } = locales;

    plugins.push(
      localesGenerator({
        outDir: path.join(buildContext.outDir, "locales"),
        docsDir: path.resolve(docsDir),
        labelsDir: path.resolve(labelsDir),
        languages,
      }),
    );
  }

  const copyTargets: CopyTarget[] = [];

  const publicDir = path.resolve(
    staticDirs.public ?? path.join(srcDir, "public"),
  );
  if (fs.existsSync(publicDir)) {
    copyTargets.push({
      src: publicDir,
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
    base: `/${path.join("resources", buildContext.packageName)}`,
    publicDir: path.resolve(srcDir, "public"),
    resolve: {
      alias: {
        "@": path.resolve(srcDir),
      },
    },
    plugins,
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
          entryFileNames: path.join("resources", "index.[hash].js"),
          chunkFileNames: path.join("resources", "vendor.[hash].js"),
          assetFileNames: path.join("resources", "[name].[hash].[ext]"),
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
      fs.unlinkSync(entryPath);
    }
  }
}

export { build };
