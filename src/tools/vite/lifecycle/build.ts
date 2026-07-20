import type { Plugin } from "vite";
import { BuildError } from "../errors";
import { logger } from "../logger";
import type { BuildPluginOptions } from "../types";
import { build as buildServer } from "../server";
import { build as buildClient } from "../client";
import { cleanDir, copyFiles } from "../utils";

function buildPlugin(options: BuildPluginOptions): Plugin {
  const {
    serverBuildOptions,
    clientBuildOptions,
    extraFilesCopyTargets,
    buildContext,
  } = options;

  return {
    name: "vite-plugin-nrg:build",
    apply: "build",

    async buildStart() {
      try {
        cleanDir(buildContext.outDir);
        logger.info("Cleaned output");

        await buildServer(serverBuildOptions, buildContext);
        await buildClient(clientBuildOptions, buildContext);
        logger.info("Built");

        if (extraFilesCopyTargets.length) {
          copyFiles(extraFilesCopyTargets, buildContext.outDir);
          logger.info("Copied extra files");
        }
        logger.success("Build complete");
        process.exit(0);
      } catch (error) {
        if (error instanceof BuildError) {
          logger.error(`Build failed: ${error.message}`, error.cause);
        } else {
          logger.error("Unexpected error during build", error as Error);
        }
        process.exit(1);
      }
    },
  };
}

export { buildPlugin };
