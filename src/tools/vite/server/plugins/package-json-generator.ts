import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { logger } from "../../logger";
import type { PackageJson } from "../../types";
// The toolkit→runtime map lives with the rename it drives (runtime-imports); we
// use it here only to compute which runtime package the generated package.json
// must declare as a dependency. The emitted JS keeps the toolkit specifier.
import { RUNTIME_REWRITES } from "./runtime-imports";

// NOTE: don't want to recreate it every time resolveId runs
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

// Runtime package → the dev package whose version it tracks (lockstep), so a
// consumer that only declares @bonsae/nrg still pins @bonsae/nrg-runtime right.
const RUNTIME_VERSION_SOURCE: Record<string, string> = {
  "@bonsae/nrg-runtime": "@bonsae/nrg",
};

function buildTypesPath(entryName: string): string {
  return `./${entryName}.d.ts`;
}

function buildOutputPath(entryName: string): string {
  return `./${entryName}.js`;
}

function buildExportKey(entryName: string): string {
  return entryName === "index" ? "." : `./${entryName}`;
}

function buildEsmOutputPath(entryName: string): string {
  return `./${entryName}.mjs`;
}

function generateExports(
  entryNames: string[],
  format: "cjs" | "esm" = "cjs",
): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  for (const name of entryNames) {
    const key = buildExportKey(name);
    if (format === "esm") {
      exports[key] = {
        types: buildTypesPath(name),
        import: buildEsmOutputPath(name),
        require: buildOutputPath(name),
        default: buildOutputPath(name),
      };
    } else {
      exports[key] = {
        types: buildTypesPath(name),
        require: buildOutputPath(name),
        default: buildOutputPath(name),
      };
    }
  }
  return exports;
}

function patchExportsWithTypes(
  existingExports: Record<string, unknown>,
  entryNames: string[],
): Record<string, unknown> {
  const patched: Record<string, unknown> = { ...existingExports };
  for (const [key, value] of Object.entries(patched)) {
    const entryName = key === "." ? "index" : key.replace(/^\.\//, "");
    if (!entryNames.includes(entryName)) continue;
    const typesPath = buildTypesPath(entryName);
    if (typeof value === "string") {
      patched[key] = { types: typesPath, require: value, default: value };
    } else if (typeof value === "object" && value !== null) {
      const condition = value as Record<string, unknown>;
      if (!condition.types) {
        patched[key] = { types: typesPath, ...condition };
      }
    }
  }
  return patched;
}

function packageJsonGenerator(options: {
  outDir: string;
  bundled?: string[];
  types?: boolean;
  entryNames?: string[];
  format?: "cjs" | "esm";
  isDev?: boolean;
}): Plugin {
  const {
    outDir,
    bundled = [],
    types = false,
    entryNames = [],
    format = "cjs",
    isDev = false,
  } = options;

  const trackedDependencies = new Set<string>();
  return {
    name: "vite-plugin-node-red:server:package-json-generator",
    enforce: "pre",

    buildStart() {
      trackedDependencies.clear();
    },

    resolveId: {
      order: "pre",
      handler(source, importer) {
        // Relative/absolute imports and the internal `@/` source alias (e.g.
        // `@/schemas/*`, wired via resolve.alias to the consumer's own shared
        // sources and bundled INTO the server) are never external package
        // dependencies — `@/` is an invalid npm scope, so it can only be the
        // internal alias. Let the default/alias resolution handle (and bundle)
        // them; externalizing here would leave a raw `@/schemas/...` specifier
        // in the emitted bundle, since this pre-order hook runs before the alias.
        //
        // `@rollup/plugin-alias` rewrites `@/schemas/*` to an ABSOLUTE path and
        // re-runs resolution through this pre hook. On POSIX that path starts
        // with `/` (covered below); on Windows it starts with a drive letter
        // (`C:\…` / `C:/…`), which `startsWith("/")` misses — so match that form
        // too. Otherwise the resolved schema module is externalized and a raw
        // `C:\…` import survives in the bundle, which Node's ESM loader rejects
        // at load time (ERR_UNSUPPORTED_ESM_URL_SCHEME, "protocol 'c:'").
        if (
          !importer ||
          source.startsWith(".") ||
          source.startsWith("/") ||
          /^[A-Za-z]:[\\/]/.test(source) ||
          source.startsWith("@/")
        ) {
          return null;
        }

        if (nodeBuiltins.has(source)) {
          return { id: source, external: true };
        }

        // The emitted JS keeps the TOOLKIT specifier (loadable at build time so
        // the node-definitions extractor can execute the bundle). The generated
        // package.json, however, must declare the *runtime* as the dependency
        // (that's what the shipped, renamed bundle imports) — so compute the
        // runtime package name for dependency tracking. The rename of the
        // emitted JS happens later, in the build lifecycle via
        // rewriteEmittedRuntimeImports. Dev never renames.
        const runtimeSpecifier = isDev
          ? source
          : (RUNTIME_REWRITES[source] ?? source);
        const packageName = runtimeSpecifier.startsWith("@")
          ? runtimeSpecifier.split("/").slice(0, 2).join("/")
          : runtimeSpecifier.split("/")[0];

        if (bundled.includes(packageName)) {
          return null;
        }

        trackedDependencies.add(packageName);
        return { id: source, external: true };
      },
    },

    closeBundle() {
      const rootPackageJsonPath = path.resolve("./package.json");
      if (!fs.existsSync(rootPackageJsonPath)) {
        logger.warn(`package.json not found: ${rootPackageJsonPath}`);
        return;
      }

      const rootPackageJson = JSON.parse(
        fs.readFileSync(rootPackageJsonPath, "utf-8"),
      ) as PackageJson;

      const sourceDeps: Record<string, string> =
        rootPackageJson.dependencies ?? {};
      const devDeps: Record<string, string> =
        rootPackageJson.devDependencies ?? {};
      const peerDeps: Record<string, string> =
        rootPackageJson.peerDependencies ?? {};
      let distDependencies: Record<string, string> | undefined = {};
      for (const dep of trackedDependencies) {
        if (peerDeps[dep]) {
          continue;
        }
        const versionSource = RUNTIME_VERSION_SOURCE[dep];
        // The lockstep source (@bonsae/nrg) is recommended as a devDependency,
        // so resolve its version from dependencies OR devDependencies — else a
        // doc-following consumer would emit no runtime dependency at all.
        const sourceVersion = versionSource
          ? (sourceDeps[versionSource] ?? devDeps[versionSource])
          : undefined;
        if (sourceDeps[dep]) {
          distDependencies[dep] = sourceDeps[dep];
        } else if (sourceVersion) {
          // @bonsae/nrg-runtime tracks the @bonsae/nrg version (lockstep)
          distDependencies[dep] = sourceVersion;
        } else {
          const dependencyPackageJsonPath = path.resolve(
            `./node_modules/${dep}/package.json`,
          );
          if (fs.existsSync(dependencyPackageJsonPath)) {
            const dependencyPackageJson = JSON.parse(
              fs.readFileSync(dependencyPackageJsonPath, "utf-8"),
            ) as PackageJson;
            distDependencies[dep] = `^${dependencyPackageJson.version}`;
          }
        }
      }

      if (Object.keys(distDependencies).length === 0) {
        distDependencies = undefined;
      }

      // Whitelist the published fields rather than spreading the consumer's
      // root manifest — spreading leaks `private`, `publishConfig`, `files`,
      // `peerDependencies`, `lint-staged`, etc. A `private: true` root would
      // otherwise emit an unpublishable Node-RED package.
      const distPackageJson: PackageJson = {
        name: rootPackageJson.name,
        version: rootPackageJson.version,
        description: rootPackageJson.description,
        author: rootPackageJson.author,
        license: rootPackageJson.license,
        homepage: rootPackageJson.homepage,
        repository: rootPackageJson.repository,
        bugs: rootPackageJson.bugs,
        engines: rootPackageJson.engines,
        main: "index.js",
        type: "commonjs",
        dependencies: distDependencies,
        keywords: [
          ...new Set([...(rootPackageJson.keywords ?? []), "node-red"]),
        ],
        "node-red": {
          nodes: { nodes: "index.js" },
        },
      };

      if (types && entryNames.length > 0) {
        const userExports = rootPackageJson.exports;
        if (userExports && Object.keys(userExports).length > 0) {
          distPackageJson.exports = patchExportsWithTypes(
            userExports,
            entryNames,
          );
        } else {
          distPackageJson.exports = generateExports(entryNames, format);
          if (entryNames.includes("index")) {
            distPackageJson.types = "index.d.ts";
          }
        }
      }

      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(outDir, "package.json"),
        JSON.stringify(distPackageJson, null, 2),
      );
    },
  };
}

export {
  packageJsonGenerator,
  buildTypesPath,
  buildOutputPath,
  buildExportKey,
  buildEsmOutputPath,
  generateExports,
  patchExportsWithTypes,
};
