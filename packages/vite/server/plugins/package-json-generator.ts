import type { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { builtinModules } from "node:module";
import { logger } from "../../logger";
import type { PackageJson } from "../../types";

// NOTE: don't want to recreate it every time resolveId runs
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

function buildTypesPath(entryName: string): string {
  return `./${entryName}.d.ts`;
}

function buildOutputPath(entryName: string): string {
  return `./${entryName}.js`;
}

function buildExportKey(entryName: string): string {
  return entryName === "index" ? "." : `./${entryName}`;
}

function generateExports(entryNames: string[]): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  for (const name of entryNames) {
    const key = buildExportKey(name);
    exports[key] = {
      types: buildTypesPath(name),
      require: buildOutputPath(name),
      default: buildOutputPath(name),
    };
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

export function packageJsonGenerator(options: {
  outDir: string;
  bundled?: string[];
  types?: boolean;
  entryNames?: string[];
}): Plugin {
  const { outDir, bundled = [], types = false, entryNames = [] } = options;

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
        if (!importer || source.startsWith(".") || source.startsWith("/")) {
          return null;
        }

        if (nodeBuiltins.has(source)) {
          return { id: source, external: true };
        }

        const packageName = source.startsWith("@")
          ? source.split("/").slice(0, 2).join("/")
          : source.split("/")[0];

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
      const peerDeps: Record<string, string> =
        rootPackageJson.peerDependencies ?? {};
      let distDependencies: Record<string, string> | undefined = {};
      for (const dep of trackedDependencies) {
        if (peerDeps[dep]) {
          continue;
        }
        if (sourceDeps[dep]) {
          distDependencies[dep] = sourceDeps[dep];
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

      const distPackageJson: PackageJson = {
        ...rootPackageJson,
        main: "index.js",
        type: "commonjs",
        devDependencies: undefined,
        scripts: undefined,
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
          distPackageJson.exports = patchExportsWithTypes(userExports, entryNames);
        } else {
          distPackageJson.exports = generateExports(entryNames);
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
