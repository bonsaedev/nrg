interface BuildContext {
  outDir: string;
  packageName: string;
  isDev: boolean;
  /** Resolved server source dir, scanned to recover `Unsafe<T>()` types for docs. */
  serverSrcDir?: string;
  /**
   * Resolved resources dir (default ./src/resources). Its convention subfolders
   * are auto-handled: `icons/` and `locales/{docs,labels}/` run their pipelines,
   * every other folder is copied verbatim to `dist/<name>`. @default ./src/resources
   */
  resourcesDir: string;
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
  /** Global variable name for the UMD/IIFE bundle. @default "NodeRedNodes" */
  name?: string;
  /** Output format for the client bundle. @default "es" */
  format?: "es" | "iife" | "umd";
  /** Path to LICENSE file to include in the HTML output. @default "./LICENSE" */
  licensePath?: string;
  /** Directory for the editor's public static files, copied to dist/resources/. @default "./src/client/public" */
  publicDir?: string;
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
 * Options for the dev server that runs and fronts the local Node-RED instance.
 */
interface ServerOptions {
  /** Options for the Node-RED dev server launcher. */
  nodeRed?: NodeRedLauncherOptions;
  /**
   * Print every dependency build warning in full instead of collapsing the
   * non-actionable ones into a single summary line. @default false
   */
  verbose?: boolean;
}

/**
 * Options for building the distributable Node-RED package.
 */
interface BuildOptions {
  /** Output directory for the built Node-RED package. @default "./dist" */
  outDir?: string;
  /** Options for building the server-side node runtime. */
  server?: ServerBuildOptions;
  /** Options for building the client-side editor UI. */
  client?: ClientBuildOptions;
}

/**
 * Options for the `nrg()` Vite plugin.
 *
 * All options are optional — defaults work for the standard `src/` directory
 * layout. Options are grouped by concern: `server` for the dev server and
 * `build` for the production bundle.
 */
interface NrgPluginOptions {
  /** Dev server options (Node-RED launcher). */
  server?: ServerOptions;
  /** Production build options (output dir, server/client bundles, copies). */
  build?: BuildOptions;
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
  /** Print every dependency build warning instead of collapsing them. */
  verbose?: boolean;
}

export type {
  BuildContext,
  BuildOptions,
  BuildPluginOptions,
  ClientBuildOptions,
  CopyTarget,
  LoggerOptions,
  NodeRedLauncher,
  NodeRedLauncherOptions,
  NrgPluginOptions,
  PackageJson,
  ServerBuildOptions,
  ServerOptions,
  ServerPluginOptions,
};
