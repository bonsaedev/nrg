import type { Http2ServerRequest } from "http2";

export interface NodeRedRuntimeSettings {
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
