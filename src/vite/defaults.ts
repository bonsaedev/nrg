import type {
  CopyTarget,
  ClientBuildOptions,
  NodeRedLauncherOptions,
  ServerBuildOptions,
} from "./types";

const DEFAULT_OUTPUT_DIR = "./dist";

// Dev/serve builds land here instead of polluting the project root with `dist`
// (the publishable artifact, written only by `vite build`). Matches the
// `.next`/`.nuxt`/`.svelte-kit` convention; add it to the consumer's .gitignore.
const DEFAULT_DEV_OUTPUT_DIR = "./.nrg";

/**
 * Resources convention root. Drop folders here and the build handles them by
 * name: `icons/` and `locales/{docs,labels}/` run their pipelines, every other
 * folder (e.g. `examples/`) is copied verbatim to `dist/<name>`. No config props.
 */
const DEFAULT_RESOURCES_DIR = "./src/resources";

const DEFAULT_CLIENT_BUILD_OPTIONS: ClientBuildOptions = {
  srcDir: "./src/client",
  entry: "index.ts",
  nodesSubdir: "nodes",
  name: "NodeRedNodes",
  format: "es",
  licensePath: "./LICENSE",
  external: ["jquery", "node-red", "vue", "@bonsae/nrg/client"],
  globals: {
    jquery: "$",
    "node-red": "RED",
    vue: "Vue",
  },
  publicDir: "./src/client/public",
};

const DEFAULT_SERVER_BUILD_OPTIONS: ServerBuildOptions = {
  srcDir: "./src/server",
  entry: "index.ts",
  format: "esm",
  external: [],
  bundled: [],
  types: true,
  nodeTarget: "node22",
};

const DEFAULT_NODE_RED_LAUNCHER_OPTIONS: NodeRedLauncherOptions = {
  runtime: {
    port: 1880,
    settingsFilepath: "./node-red.settings.ts",
    version: "latest",
  },
  restartDelay: 1000,
  args: [],
};

// Always-copied package files (examples and other assets now live under the
// resources convention, auto-discovered — see DEFAULT_RESOURCES_DIR).
const DEFAULT_EXTRA_FILES_COPY_TARGETS: CopyTarget[] = [
  { src: "./LICENSE", dest: "LICENSE" },
  { src: "./README.md", dest: "README.md" },
];

export {
  DEFAULT_CLIENT_BUILD_OPTIONS,
  DEFAULT_SERVER_BUILD_OPTIONS,
  DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
  DEFAULT_EXTRA_FILES_COPY_TARGETS,
  DEFAULT_RESOURCES_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_DEV_OUTPUT_DIR,
};
