import type { EventEmitter } from "events";
import type { Express, RequestHandler } from "express";
import type { NodeRedRuntimeSettings } from "../../../types";
import type { Validator } from "../../validator";

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
  _node?: any;
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
  getNode(id: string): (NodeRedNode & { _node?: any }) | undefined;
  createNode(node: NodeRedNode, config: Record<string, any>): void;
  getCredentials(id: string): Record<string, any> | undefined;
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
  /** Runtime settings (user-provided settings plus node-registered settings) */
  settings: NodeRedRuntimeSettings & Record<string, any>;
  /** Node-RED version string */
  version(): string;
  /** @internal — framework validator, set by initValidator() */
  readonly validator: Validator;
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

export {
  RED,
  NodeRedExpressApp,
  NodeRedRequestHandler,
  NodeRedNode,
  NodeRedNodeContext,
  NodeRedContextStore,
};
