import type { Http2ServerRequest } from "node:http2";
import type { EventEmitter } from "node:events";
import type { Express, RequestHandler } from "express";
import type { INode } from "./nodes";
import type { Validator } from "../shared/validator";
import type { LaneStore } from "./lane-store";

interface NodeRedSettings {
  userDir?: string;
  nodesDir?: string | string[];
  flowFile?: string;
  flowFilePretty?: boolean;
  credentialSecret?: string | false;
  requireHttps?: boolean;
  https?:
    | { key: string; cert: string }
    | (() =>
        | Promise<{ key: string; cert: string }>
        | { key: string; cert: string });
  httpsRefreshInterval?: number;
  httpAdminRoot?: string;
  httpNodeRoot?: string;
  httpNodeCors?: { origin: string; methods: string };
  httpStatic?: string | { path: string; root: string }[];
  httpStaticRoot?: string;
  httpAdminMiddleware?: (req: unknown, res: unknown, next: () => void) => void;
  httpNodeMiddleware?: (req: unknown, res: unknown, next: () => void) => void;
  httpServerOptions?: Record<string, unknown>;
  adminAuth?: {
    type?: "credentials" | "strategy";
    users?: {
      username: string;
      password: string;
      permissions?: string | string[];
    }[];
    default?: {
      permissions?: string | string[];
    };
    tokens?: (
      token: string,
    ) => Promise<{ user: string; permissions: string | string[] } | null>;
    tokenHeader: "string";
    sessionExpiryTime?: number;
    [key: string]: unknown;
  };
  httpNodeAuth?: {
    user?: string;
    pass?: string;
  };
  httpStaticAuth?: {
    user?: string;
    pass?: string;
  };
  lang?:
    | "en-US"
    | "de"
    | "es-ES"
    | "fr"
    | "ko"
    | "pt-BR"
    | "ru"
    | "ja"
    | "zh-CN"
    | "zh-TW";
  diagnostics?: {
    enabled?: boolean;
    ui?: boolean;
  };
  runtimeState?: {
    enabled?: boolean;
    ui?: boolean;
  };
  disableEditor?: boolean;
  editorTheme?: {
    page?: {
      title?: string;
      favicon?: string;
      css?: string | string[];
      scripts?: string | string[];
    };
    header?: {
      title?: string;
      image?: string;
      url?: string;
    };
    deployButton?: {
      type?: "simple" | "default";
      label?: string;
      icon?: string;
    };
    menu?: {
      "menu-item-import-library"?: boolean;
      "menu-item-export-library"?: boolean;
      "menu-item-keyboard-shortcuts"?: boolean;
      "menu-item-help"?: {
        label?: string;
        url?: string;
      };
      [menuItem: string]:
        | boolean
        | { label?: string; url?: string }
        | undefined;
    };
    userMenu?: boolean;
    login?: {
      image?: string;
    };
    logout?: {
      redirect?: string;
    };
    palette?: {
      catalogues?: string[];
      categories?: string[];
      theme?: { category: string; type: string; color: string }[];
    };
    projects?: {
      enabled?: boolean;
      workflow?: {
        mode: "manual" | "auto";
      };
    };
    codeEditor?: {
      lib?: "monaco" | "ace";
      options?: Record<string, unknown>;
    };
    mermaid?: {
      theme?: string;
    };
    tours?: boolean;
    theme?: string;
    [key: string]: unknown;
  };
  contextStorage?: {
    default?: {
      module?: "memory" | "localfilesystem" | object;
      config?: Record<string, unknown>;
    };
    [store: string]:
      | {
          module?: "memory" | "localfilesystem" | object;
          config?: Record<string, unknown>;
        }
      | undefined;
  };
  exportGlobalContextKeys?: boolean;
  logging?: {
    console?: {
      level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "off";
      metrics?: boolean;
      audit?: boolean;
    };
  };
  fileWorkingDirectory?: string;
  functionExternalModules?: boolean;
  functionGlobalContext?: Record<string, unknown>;
  nodeMessageBufferMaxLength?: number;
  functionTimeout?: number;
  externalModules?: {
    autoInstall?: boolean;
    autoInstallRetry?: number;
    palette?: {
      allowInstall?: boolean;
      allowUpdate?: boolean;
      allowUpload?: boolean;
      allowList?: string[];
      denyList?: string[];
      allowUpdateList?: string[];
      denyUpdateList?: string[];
    };
    modules?: {
      allowInstall?: boolean;
      allowList?: string[];
      denyList?: string[];
    };
  };
  execMaxBufferSize?: number;
  debugMaxLength?: number;
  debugUseColors?: boolean;
  httpRequestTimeout?: number;
  mqttReconnectTime?: number;
  serialReconnectTime?: number;
  socketReconnectTime?: number;
  socketTimeout?: number;
  tcpMsgQueueSize?: number;
  inboundWebSocketTimeout?: number;
  tlsConfigDisableLocalFiles?: boolean;
  webSocketNodeVerifyClient?: (info: {
    origin: string;
    req: Http2ServerRequest;
    secure: boolean;
  }) => boolean;
  apiMaxLength?: string;
  [key: string]: unknown;
}

interface NodeRedLog {
  info(msg: any): void;
  warn(msg: any): void;
  error(msg: any, error?: any): void;
  debug(msg: any): void;
  trace(msg: any): void;
  log(msg: { level: number; msg: string }): void;
  metric(): boolean;
  audit(msg: Record<string, any>, req?: any): void;
  addHandler(handler: (msg: any) => void): void;
  removeHandler(handler: (msg: any) => void): void;
  FATAL: 10;
  ERROR: 20;
  WARN: 30;
  INFO: 40;
  DEBUG: 50;
  TRACE: 60;
  AUDIT: 98;
  METRIC: 99;
}

interface NodeRedNode {
  id: string;
  type: string;
  name?: string;
  z?: string;
  x: number;
  y: number;
  g?: string;
  wires: string[][];
  credentials: any;
  _node?: INode;
  send(msg: any): void;
  receive(msg: any): void;
  status(
    status: string | { fill?: string; shape?: string; text?: string },
  ): void;
  updateWires(wires: string[][]): void;
  on(event: string, callback: (...args: any[]) => void): void;
  log(msg: any): void;
  warn(msg: any): void;
  error(msg: any, errorMsg?: any): void;
  context(): NodeRedNodeContext;
  [key: string]: any;
}

interface NodeRedNodeContext extends NodeRedContextStore {
  flow: NodeRedContextStore;
  global: NodeRedContextStore;
}

interface NodeRedNodes {
  registerType(type: string, constructor: any, opts?: any): void;
  getNode(id: string): (NodeRedNode & { _node?: INode }) | undefined;
  createNode(node: NodeRedNode, config: Record<string, any>): void;
  getCredentials(id: string): Record<string, any> | undefined;
  /** Merge credentials into a node's stored credential set (runtime API). */
  addCredentials(id: string, credentials: Record<string, any>): void;
  eachNode(callback: (node: any) => void): void;
  getType(type: string): any;
  getNodeInfo(type: string): any;
  getNodeList(filter?: any): any[];
  getModuleInfo(module: string): any;
  installModule(module: string, version?: string): Promise<any>;
  uninstallModule(module: string): Promise<any>;
  enableNode(id: string): Promise<any>;
  disableNode(id: string): Promise<any>;
}

interface NodeRedUtil {
  evaluateNodeProperty(
    value: any,
    type: string,
    node: any,
    msg: Record<string, any> | undefined,
    callback: (err: Error | null, result: any) => void,
  ): void;
  generateId(): string;
  cloneMessage<T = any>(msg: T): T;
  ensureString(o: any): string;
  ensureBuffer(o: any): Buffer;
  compareObjects(obj1: any, obj2: any): boolean;
  getMessageProperty(msg: any, expr: string): any;
  setMessageProperty(
    msg: any,
    prop: string,
    value: any,
    createMissing?: boolean,
  ): void;
  getObjectProperty(obj: any, expr: string): any;
  setObjectProperty(
    obj: any,
    prop: string,
    value: any,
    createMissing?: boolean,
  ): void;
  normalisePropertyExpression(
    str: string,
    msg?: any,
    toString?: boolean,
  ): string[];
  normaliseNodeTypeName(name: string): string;
  prepareJSONataExpression(value: string, node: any): any;
  evaluateJSONataExpression(
    expr: any,
    msg: any,
    callback: (err: Error | null, result: any) => void,
  ): void;
  parseContextStore(key: string): {
    store: string | undefined;
    key: string;
  };
  getSetting(node: any, name: string, flow?: any): any;
  encodeObject(obj: any): any;
}

interface NodeRedHooks {
  add(hookId: string, callback: (event: any) => void | Promise<void>): void;
  remove(hookId: string): void;
  trigger(
    hookId: string,
    event: any,
    callback?: (err?: Error) => void,
  ): void | Promise<void>;
  has(hookId: string): boolean;
  clear(): void;
}

type NodeRedExpressApp = Express;
type NodeRedRequestHandler = RequestHandler;

interface RED {
  /** Internationalization function */
  _(key: string, substitutions?: Record<string, string>): string;
  /** Logging API */
  log: NodeRedLog;
  /** Node registry and management */
  nodes: NodeRedNodes;
  /** Utility functions */
  util: NodeRedUtil;
  /** Hook system for message lifecycle and module events */
  hooks: NodeRedHooks;
  /** Runtime event emitter */
  events: EventEmitter;
  /** Express app for admin HTTP endpoints */
  httpAdmin: NodeRedExpressApp;
  /** Express app for node HTTP endpoints */
  httpNode: NodeRedExpressApp;
  /**
   * Admin authentication API. Absent when the runtime exposes no auth layer
   * (older versions / test shims); `needsPermission` returns an Express
   * middleware that enforces a permission (e.g. `"flows.read"`) — a passthrough
   * when adminAuth isn't configured.
   */
  auth?: {
    needsPermission(permission: string): RequestHandler;
  };
  /** Runtime settings (user-provided settings plus node-registered settings) */
  settings: NodeRedSettings & Record<string, any>;
  /** Node-RED version string */
  version(): string;
  /** @internal — framework validator, set by globals `init()` */
  readonly validator: Validator;
  /**
   * @internal — off-the-wire message-lane store, set by globals `init()` (see
   * ./lane-store). Non-enumerable; holds each message's `protected` /
   * `private` lane data keyed by `_msgid`, never serialized onto the message.
   */
  readonly laneStore: LaneStore;
}

interface NodeRedContextStore {
  get(
    key: string,
    store: string | undefined,
    callback: (err: Error | null, value: any) => void,
  ): void;
  set(
    key: string,
    value: any,
    store: string | undefined,
    callback: (err: Error | null) => void,
  ): void;
  keys(
    store: string | undefined,
    callback: (err: Error | null, keys: string[]) => void,
  ): void;
  /**
   * Optional atomic add — provided by context stores that support it (e.g.
   * DynamoDB `ADD` / Redis `INCR`). When absent, nrg serializes in-process.
   */
  increment?(
    key: string,
    by: number,
    store: string | undefined,
    callback: (err: Error | null, value: number) => void,
  ): void;
  /**
   * Optional atomic read-modify-write — provided by stores that support it
   * (e.g. a DynamoDB conditional write). When absent, nrg serializes in-process.
   */
  update?(
    key: string,
    fn: (current: any) => any,
    store: string | undefined,
    callback: (err: Error | null, value: any) => void,
  ): void;
}

export type {
  NodeRedSettings,
  RED,
  NodeRedExpressApp,
  NodeRedRequestHandler,
  NodeRedNode,
  NodeRedNodeContext,
  NodeRedContextStore,
};
