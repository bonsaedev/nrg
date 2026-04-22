import type { InlineConfig } from "vite";
import { build as viteBuild } from "vite";
import fs from "fs";
import path from "path";
import { BuildError } from "../errors";
import { logger } from "../logger";
import type { ServerBuildOptions, BuildContext } from "../types";
import { packageJsonGenerator, typeGenerator, cjsWrapper } from "./plugins";

async function build(
  serverOpts: ServerBuildOptions,
  buildContext: BuildContext,
): Promise<void> {
  const {
    srcDir = "./server",
    entry = "index.ts",
    bundled = [],
    types = true,
    nodeTarget = "node22",
    plugins: userPlugins = [],
  } = serverOpts;

  const entries = Array.isArray(entry) ? entry : [entry];
  const resolvedSrcDir = path.resolve(srcDir);
  const entryPoints = {};
  for (const entry of entries) {
    const entryFilePath = path.join(resolvedSrcDir, entry);
    if (fs.existsSync(entryFilePath)) {
      const fileName = entry.replace(/\.ts$/, "");
      entryPoints[fileName] = entryFilePath;
    }
  }
  if (Object.keys(entryPoints).length === 0) {
    logger.warn("No server entry points found");
    return;
  }

  const plugins = [
    packageJsonGenerator({
      outDir: buildContext.outDir,
      bundled,
      types: types && !buildContext.isDev,
      entryNames: Object.keys(entryPoints),
    }),
    cjsWrapper(),
    ...userPlugins,
  ];

  if (types && !buildContext.isDev) {
    plugins.push(
      ...typeGenerator({
        srcDir: resolvedSrcDir,
        outDir: buildContext.outDir,
        entryFiles: Object.values(entryPoints),
      }),
    );
  }

  const config: InlineConfig = {
    configFile: false,
    logLevel: "warn",
    plugins,
    build: {
      outDir: buildContext.outDir,
      emptyOutDir: false,
      sourcemap: buildContext.isDev ? "inline" : false,
      minify: !buildContext.isDev,
      lib: {
        entry: entryPoints,
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "[name].js",
          exports: "auto",
          preserveModules: false,
        },
      },
    },
    esbuild: {
      platform: "node",
      target: nodeTarget,
      keepNames: true,
    },
  };

  try {
    await viteBuild(config);
  } catch (error) {
    throw new BuildError("server", error as Error);
  }
}

export { build };
