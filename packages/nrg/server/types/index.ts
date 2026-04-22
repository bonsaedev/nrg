import type { TObject } from "@sinclair/typebox";

interface RED {
  _: (key: string, substitutions?: Record<string, string>) => string;
  log: {
    info(msg: any): void;
    warn(msg: any): void;
    error(message: string, error: any): void;
    debug(msg: any): void;
    trace(msg: any): void;
  };
  nodes: {
    registerType: (type: string, def: any, opts?: any) => void;
    getNode: <T = any>(id: string) => T | undefined;
    createNode: (node: any, config: Record<string, any>) => void;
    getCredentials: (id: string) => Record<string, any> | undefined;
  };
  httpAdmin: {
    get(path: string, handler: (req: any, res: any) => void): void;
    post(path: string, handler: (req: any, res: any) => void): void;
    put(path: string, handler: (req: any, res: any) => void): void;
    delete(path: string, handler: (req: any, res: any) => void): void;
  };
  util: {
    evaluateNodeProperty(
      value: any,
      type: string,
      node: any,
      msg: Record<string, any> | undefined,
      callback: (err: Error | null, result: any) => void,
    ): void;
  };
  settings: Record<string, any>;
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
}

interface NodeDefinitionApiResponse {
  type: string;
  align?: "left" | "right";
  category?: "config" | string;
  color?: `#${string}`;
  icon?: string;
  labelStyle?: "node_label" | "node_label_italic" | string;
  paletteLabel?: string;
  inputs?: number;
  outputs?: number;
  inputLabels?: string | string[];
  outputLabels?: string | string[];
  configSchema: TObject | null;
  credentialsSchema: TObject | null;
  inputSchema?: TObject | null;
  outputsSchema?: TObject | null;
  settingsSchema?: TObject | null;
}

export { RED, NodeDefinitionApiResponse, NodeRedContextStore };
