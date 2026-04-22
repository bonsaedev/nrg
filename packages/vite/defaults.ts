import type {
  CopyTarget,
  ClientBuildOptions,
  NodeRedLauncherOptions,
  ServerBuildOptions,
} from "./types";

const DEFAULT_OUTPUT_DIR = "./dist";

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
  locales: {
    docsDir: "./src/locales/docs",
    labelsDir: "./src/locales/labels",
    languages: [
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
  },
  staticDirs: {
    icons: "./src/icons",
    public: "./src/client/public",
  },
};

const DEFAULT_SERVER_BUILD_OPTIONS: ServerBuildOptions = {
  srcDir: "./src/server",
  entry: "index.ts",
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

const DEFAULT_EXTRA_FILES_COPY_TARGETS: CopyTarget[] = [
  { src: "./LICENSE", dest: "LICENSE" },
  { src: "./README.md", dest: "README.md" },
  { src: "./src/examples", dest: "examples" },
];

export {
  DEFAULT_CLIENT_BUILD_OPTIONS,
  DEFAULT_SERVER_BUILD_OPTIONS,
  DEFAULT_NODE_RED_LAUNCHER_OPTIONS,
  DEFAULT_EXTRA_FILES_COPY_TARGETS,
  DEFAULT_OUTPUT_DIR,
};
