import type { InlineConfig } from "vite";
import { build as viteBuild } from "vite";
import fs from "node:fs";
import path from "node:path";
import { BuildError } from "../errors";
import { logger } from "../logger";
import type { ServerBuildOptions, BuildContext } from "../types";
import {
  packageJsonGenerator,
  cjsWrapper,
  esmWrapper,
  extractNodeDefinitions,
  extractNodeTypesFromSrc,
  writeNodeTypesJson,
  generatePackageDts,
  rewriteEmittedRuntimeImports,
  portTopology,
  portTopologyInjector,
} from "./plugins";
import type { PortTopology } from "./plugins/node-type-info";

async function build(
  serverOpts: ServerBuildOptions,
  buildContext: BuildContext,
  collectWarnings = false,
): Promise<void> {
  const {
    srcDir = "./server",
    entry = "index.ts",
    format = "esm",
    external = [],
    bundled = [],
    types = true,
    nodeTarget = "node22",
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

  const isEsm = format === "esm";

  // Extract each node's TypeScript types up front — the source of truth for port
  // topology (schemas are validation-only). Best-effort: if it throws, the map
  // stays empty, the injector is a no-op, and the runtime falls back to the
  // schema. Runs in dev too (a schema-free node needs its topology to route),
  // and is reused for node-types.json / index.d.ts (prod) so tsc runs once.
  // NOTE: the ts.Program is not cheap; caching per changed file is a follow-up.
  let infos: ReturnType<typeof extractNodeTypesFromSrc> = [];
  try {
    infos = extractNodeTypesFromSrc(resolvedSrcDir);
  } catch (error) {
    logger.warn(`node type extraction skipped: ${(error as Error).message}`);
  }

  // Map each node's source file → its generic-derived port topology, for the
  // injector to stamp as `<Node>.__nrgPorts`. Untyped nodes yield no entry.
  const topologyMap = new Map<string, PortTopology>();
  for (const info of infos) {
    if (!info.sourceFile) continue;
    const ports = portTopology(info);
    if (ports) topologyMap.set(path.resolve(info.sourceFile), ports);
  }

  const plugins = [
    packageJsonGenerator({
      outDir: buildContext.outDir,
      bundled,
      types: types && !buildContext.isDev,
      entryNames: Object.keys(entryPoints),
      format,
      isDev: buildContext.isDev,
    }),
    isEsm ? esmWrapper() : cjsWrapper(),
    portTopologyInjector(topologyMap),
  ];

  const config: InlineConfig = {
    configFile: false,
    logLevel: "warn",
    // Route dependency warnings into the logger's collector so the dev loop can
    // collapse them; the prod build keeps vite's default logger.
    customLogger: collectWarnings ? logger.viteWarnLogger() : undefined,
    plugins,
    // esbuild reads no tsconfig here (tsconfigRaw: "{}"), so the `@/schemas`
    // path alias from the shipped base tsconfig isn't applied at build time —
    // wire it up for Vite so a consumer's server nodes can import their shared
    // schemas via `@/schemas/*`. Resolve from the server srcDir (`../shared/schemas`)
    // rather than process.cwd(), so it's correct even when the build runs from a
    // different cwd than the project root (e.g. nrg's own in-process fixture builds).
    resolve: {
      alias: {
        "@/schemas": path.resolve(resolvedSrcDir, "../shared/schemas"),
      },
    },
    build: {
      outDir: buildContext.outDir,
      emptyOutDir: false,
      // The server bundle is require()d locally by Node-RED, never shipped over
      // the wire — so we never minify it. Readable code means production stack
      // traces carry real function names and line numbers, debuggable without a
      // source map. (Minification only pays off for the browser client bundle,
      // which stays minified + content-hashed.)
      minify: false,
      // Dev: accurate inline maps. Prod: no map — unminified code is already
      // debuggable, and a prod map would be misaligned anyway (the ESM/CJS
      // output wrappers prepend/append and return `map: null`, and the post-emit
      // @bonsae/nrg → @bonsae/nrg-runtime rewrite shifts bytes without updating
      // the sibling .map).
      sourcemap: buildContext.isDev ? "inline" : false,
      lib: {
        entry: entryPoints,
        formats: [isEsm ? "es" : "cjs"],
      },
      rollupOptions: {
        external,
        output: {
          entryFileNames: isEsm ? "[name].mjs" : "[name].js",
          exports: isEsm ? undefined : "auto",
          preserveModules: false,
        },
      },
    },
    esbuild: {
      platform: "node",
      target: nodeTarget,
      keepNames: true,
      tsconfigRaw: "{}",
    },
  };

  try {
    await viteBuild(config);

    // Generate CJS bridge so Node-RED can require() the ESM bundle
    if (isEsm) {
      const bridgeCode = `\
'use strict';
// CJS bridge — auto-generated by @bonsae/nrg/vite
// Node-RED uses require() to load packages. This bridge delegates to the ESM bundle.
module.exports = function (RED) {
    (async () => {
        const mod = await import("./index.mjs");
        if (typeof mod.default !== 'function') {
            throw new Error('ESM bundle must export a default function(RED)');
        }
        await mod.default(RED);
    })().catch(function (err) {
        RED.log.error('Failed to load ESM bundle: ' + err.message);
    });
};
`;
      fs.writeFileSync(path.join(buildContext.outDir, "index.js"), bridgeCode);
    }

    // Read node statics from the just-built bundle (still importing the toolkit,
    // so it loads directly — no re-bundle) and write them for the client build's
    // inliner. Runs in dev and prod.
    await extractNodeDefinitions(buildContext.outDir);

    // node-types.json feeds the client help generator (the typed input/output
    // sections and the TS type of each config field). The infos are already
    // extracted above for the port-topology injector, so writing it is cheap —
    // emit it in dev too, so help docs show typed sections during development.
    writeNodeTypesJson(infos, buildContext.outDir);

    // index.d.ts — the inheritable node-class surface for downstream packages.
    // Generated with the standard toolchain (tsc declaration emit + API Extractor
    // rollup) so the types are faithful by construction and externals stay
    // externalized. Heavier than the runtime bundle and only a published package's
    // consumers need it, so it stays prod-only.
    if (!buildContext.isDev && types) {
      generatePackageDts(
        infos,
        resolvedSrcDir,
        buildContext.outDir,
        Object.keys(entryPoints),
      );
    }

    // Production only: rename the emitted server imports from the toolkit to the
    // runtime package — the single, final rewrite, after the extractor has read
    // the bundle. Dev keeps the toolkit import (loaded from the output dir).
    if (!buildContext.isDev) {
      rewriteEmittedRuntimeImports(buildContext.outDir);
    }
  } catch (error) {
    throw new BuildError("server", error as Error);
  }
}

export { build };
