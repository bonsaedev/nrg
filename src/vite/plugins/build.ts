import type { Plugin } from "vite";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
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
    name: "vite-plugin-node-red:build",
    apply: "build",

    async buildStart() {
      try {
        logger.intro();

        logger.startSpinner("Type checking");
        const serverTsconfig = path.resolve(
          serverBuildOptions.srcDir ?? "./src/server",
          "tsconfig.json",
        );
        const clientTsconfig = path.resolve(
          clientBuildOptions.srcDir ?? "./src/client",
          "tsconfig.json",
        );
        const tsconfigsToCheck = [serverTsconfig, clientTsconfig].filter((p) =>
          fs.existsSync(p),
        );
        for (const tsconfig of tsconfigsToCheck) {
          execSync(`npx tsc -p ${tsconfig} --noEmit`, { stdio: "inherit" });
        }
        logger.stopSpinner("Type checked");

        logger.startSpinner("Cleaning");
        cleanDir(buildContext.outDir);
        logger.stopSpinner("Cleaned");

        logger.startSpinner("Building");
        await buildServer(serverBuildOptions, buildContext);
        await buildClient(clientBuildOptions, buildContext);
        logger.stopSpinner("Built");

        if (extraFilesCopyTargets.length) {
          logger.startSpinner("Copying extra files");
          copyFiles(extraFilesCopyTargets, buildContext.outDir);
          logger.stopSpinner("Copied extra files");
        }
        logger.success("Success");
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
