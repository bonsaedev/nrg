interface BuildContext {
  outDir: string;
  packageName: string;
  isDev: boolean;
}

interface BuildPluginOptions {
  serverBuildOptions: ServerBuildOptions;
  clientBuildOptions: ClientBuildOptions;
  extraFilesCopyTargets: CopyTarget[];
  buildContext: BuildContext;
}

interface ClientBuildOptions {
  /** Source directory for client code. @default "./src/client" */
  srcDir?: string;
  /** Entry filename relative to srcDir. @default "index.ts" */
  entry?: string;
  /** Subdirectory name for node definition files. @default "nodes" */
  nodesSubdir?: string;
  /** Pattern to match node definition files. */
  nodeFilePattern?: RegExp;
  /** Global variable name for the UMD/IIFE bundle. @default "NodeRedNodes" */
  name?: string;
  /** Output format for the client bundle. @default "es" */
  format?: "es" | "iife" | "umd";
  /** Base public path for serving resources. */
  base?: string;
  /** Path to LICENSE file to include in the HTML output. @default "./LICENSE" */
  licensePath?: string;
  /** Internationalization options for labels and docs. */
  locales?: LocalesOptions;
  /** Directories for static assets (icons, public files). */
  staticDirs?: {
    /** Directory containing node icons ({type}.png). @default "./src/icons" */
    icons?: string;
    /** Directory for public static files copied to dist/resources/. @default "./src/client/public" */
    public?: string;
  };
  /** Modules to treat as external (not bundled). @default ["jquery", "node-red", "vue", "@bonsae/nrg/client"] */
  external?: string[];
  /** Global variable mappings for external modules. */
  globals?: Record<string, string>;
  /** Custom chunk splitting function for Rollup. */
  manualChunks?: (id: string) => string | undefined;
}

interface CopyTarget {
  /** Source file or directory path. */
  src: string;
  /** Destination path relative to the output directory. */
  dest: string;
}

interface LocalesOptions {
  /** Directory containing documentation files ({type}/{lang}.md or .html). @default "./src/locales/docs" */
  docsDir?: string;
  /** Directory containing label files ({type}/{lang}.json). @default "./src/locales/labels" */
  labelsDir?: string;
}

interface LoggerOptions {
  name: string;
  prefix?: string;
}

interface NodeRedLauncherOptions {
  runtime?: {
    /** Port for Node-RED to listen on. @default 1880 */
    port?: number;
    /** Path to the Node-RED settings file (TypeScript supported). @default "./node-red.settings.ts" */
    settingsFilepath?: string;
    /** Node-RED version to install for the dev server. @default "latest" */
    version?: string;
  };
  /** Delay in ms before restarting Node-RED after a file change. @default 1000 */
  restartDelay?: number;
  /** Additional CLI arguments passed to the Node-RED process. */
  args?: string[];
}

/**
 * Options for the `nodeRed()` Vite plugin.
 *
 * All options are optional — defaults work for the standard `src/` directory layout.
 */
interface NodeRedPluginOptions {
  /** Output directory for the built Node-RED package. @default "./dist" */
  outDir?: string;
  /** Options for building the client-side editor UI. */
  clientBuildOptions?: ClientBuildOptions;
  /** Options for building the server-side node runtime. */
  serverBuildOptions?: ServerBuildOptions;
  /** Options for the Node-RED dev server launcher. */
  nodeRedLauncherOptions?: NodeRedLauncherOptions;
  /** Extra files to copy into the output directory (e.g., LICENSE, README). */
  extraFilesCopyTargets?: CopyTarget[];
}

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  type?: "commonjs" | "module";
  main?: string;
  types?: string;
  exports?: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  keywords?: string[];
  author?: string | { name: string; email?: string; url?: string };
  license?: string;
  repository?: string | { type: string; url: string };
  bugs?: string | { url: string; email?: string };
  homepage?: string;
  engines?: Record<string, string>;
  files?: string[];
  private?: boolean;
  publishConfig?: Record<string, unknown>;
  "node-red"?: {
    nodes?: Record<string, string>;
    version?: string;
  };
  [key: string]: unknown;
}

interface ServerBuildOptions {
  /** Source directory for server code. @default "./src/server" */
  srcDir?: string;
  /** Entry filename relative to srcDir. @default "index.ts" */
  entry?: string;
  /** Output format. "esm" builds to .mjs with a CJS bridge for Node-RED. @default "esm" */
  format?: "cjs" | "esm";
  /** Packages to keep as external (not bundled). @default [] */
  external?: string[];
  /** Dependencies to bundle into the output instead of keeping as external. @default [] */
  bundled?: string[];
  /** Generate rolled-up .d.ts type declarations (production only). @default true */
  types?: boolean;
  /** esbuild target for the server bundle. @default "node22" */
  nodeTarget?: string;
}

interface NodeRedLauncher {
  start(): Promise<number>;
  stop(skipPortUsageCheck?: boolean): Promise<void>;
  cleanup(): void;
  flushLogs(): void;
  readonly preferredPort: number;
  readonly restartDelay: number;
  readonly pid: number | null;
}

interface ServerPluginOptions {
  nodeRedLauncher: NodeRedLauncher;
  serverBuildOptions: ServerBuildOptions;
  clientBuildOptions: ClientBuildOptions;
  extraFilesCopyTargets: CopyTarget[];
  buildContext: BuildContext;
}

export {
  BuildContext,
  BuildPluginOptions,
  ClientBuildOptions,
  CopyTarget,
  LocalesOptions,
  LoggerOptions,
  NodeRedLauncher,
  NodeRedLauncherOptions,
  NodeRedPluginOptions,
  PackageJson,
  ServerBuildOptions,
  ServerPluginOptions,
};
