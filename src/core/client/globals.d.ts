/**
 * Global type declarations for the Node-RED editor environment.
 * These are provided by Node-RED at runtime, not imported.
 *
 * Based on: https://github.com/GogoVega/node-red/blob/33d83d016a0c990c/packages/node_modules/%40node-red/editor-client/types/index.d.ts
 */

/// <reference types="jquery" />

// ---------------------------------------------------------------------------
// jQuery Node-RED widget extensions
// ---------------------------------------------------------------------------

interface JQuery<TElement = HTMLElement> {
  // Node-RED TypedInput widget
  typedInput(options: NodeRED.TypedInputOptions): this;
  typedInput(action: "value"): string;
  typedInput(action: "value", value: string): void;
  typedInput(action: "type"): string;
  typedInput(action: "type", value: string): void;
  typedInput(action: "types", value: any[]): void;
  typedInput(action: "validate"): boolean;
  typedInput(
    action: "validate",
    options: { returnErrorMessage: boolean },
  ): string | boolean;
  typedInput(action: "disable", value?: boolean): void;
  typedInput(action: "enable"): void;
  typedInput(action: "focus"): void;
  typedInput(action: "hide"): void;
  typedInput(action: "show"): void;
  typedInput(action: "width", value: string | number): void;

  // Node-RED i18n
  i18n(): this;
}

// ---------------------------------------------------------------------------
// Node-RED editor types
// ---------------------------------------------------------------------------

declare namespace NodeRED {
  type UID = string;

  // -- Nodes --

  interface BaseNode {
    id: UID;
    type: string;
    changed: boolean;
    z?: string;
    _def: any;
    [key: string]: any;
  }

  interface Node extends BaseNode {
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
    wires: UID[][];
    inputs: number;
    outputs: number;
    g?: string;
    _: (key: string) => string;
  }

  interface ConfigNode extends BaseNode {
    name: string;
    credentials?: Record<string, any>;
    users: BaseNode[];
    _def: {
      category: "config";
      [key: string]: any;
    };
  }

  interface Link {
    source: BaseNode;
    target: BaseNode;
    sourcePort: number;
  }

  interface Workspace {
    id: UID;
    type: "tab";
    label: string;
    disabled: boolean;
    info: string;
  }

  // -- Editor --

  interface EditorOptions {
    id: string;
    stateId?: string;
    mode?: string;
    value?: string;
    focus?: boolean;
    globals?: Record<string, boolean>;
  }

  interface TrayButton {
    id?: string;
    class?: string;
    click?: (event: JQuery.ClickEvent) => void;
    text?: string;
  }

  interface TrayOptions {
    title?: string;
    buttons?: TrayButton[];
    focusElement?: boolean;
    maximized?: boolean;
    width?: "inherit" | number | string;
    overlay?: boolean;
    open?: (tray: JQuery, done?: () => void) => void;
    close?: () => void;
    resize?: (options: { width: number; height?: number }) => void;
    show?: () => void;
  }

  // -- Popover --

  interface PopoverOptions {
    target: JQuery;
    direction?: string;
    trigger?: "hover" | "click" | "modal";
    content: string | JQuery | (() => string | JQuery);
    delay?: { show: number; hide: number };
    autoClose?: number;
    width?: number | string;
    maxWidth?: number | string;
    tooltip?: boolean;
    interactive?: boolean;
    class?: string;
  }

  interface PopoverInstance {
    readonly element: JQuery | null;
    close(instant?: boolean): PopoverInstance;
    open(instant?: boolean): PopoverInstance;
    setContent(content: PopoverOptions["content"]): PopoverInstance;
    move(options: Partial<PopoverOptions>): void;
  }

  interface TooltipInstance extends PopoverInstance {
    delete(): void;
    setAction(action: string): void;
  }

  // -- Notifications --

  interface NotificationOptions {
    type?: "warning" | "compact" | "success" | "error";
    fixed?: boolean;
    modal?: boolean;
    timeout?: number;
    buttons?: Array<{
      text: string;
      class?: string;
      click?: (event: JQuery.ClickEvent) => void;
    }>;
    id?: string;
  }

  interface NotificationElement {
    update(msg: string | JQuery, options?: NotificationOptions): void;
    close(): void;
  }

  // -- TypedInput --

  type DefaultTypedInputType =
    (typeof import("../constants").TYPED_INPUT_TYPES)[number];

  interface TypedInputTypeDefinition {
    value: string;
    label?: string;
    icon?: string;
    hasValue?: boolean;
    multiple?: boolean;
    options?: string[] | Array<{ value: string; label: string }>;
    validate?: ((value: string) => boolean) | RegExp;
    valueLabel?: (container: JQuery, value: string) => void;
    autoComplete?: (
      value: string,
      done: (result?: Array<{ value: string; label: string | JQuery }>) => void,
    ) => void;
  }

  interface TypedInputOptions {
    default?: DefaultTypedInputType | string;
    types: Array<DefaultTypedInputType | TypedInputTypeDefinition>;
    typeField?: JQuery.Selector | JQuery;
  }
}

// ---------------------------------------------------------------------------
// RED global object
// ---------------------------------------------------------------------------

declare const RED: {
  /** Internationalization / translation function */
  _: (key: string, substitutions?: Record<string, string>) => string;

  /** Node management */
  nodes: {
    registerType(type: string, definition: any): void;
    node(id: NodeRED.UID): NodeRED.BaseNode | null;
    dirty(): boolean;
    dirty(dirty: boolean): void;
    eachNode(callback: (node: NodeRED.Node) => void | false): void;
    eachConfig(callback: (node: NodeRED.ConfigNode) => void | false): void;
    filterNodes(filter: { z?: NodeRED.UID; type?: string }): NodeRED.BaseNode[];
    filterLinks(filter: {
      source?: NodeRED.BaseNode;
      target?: NodeRED.BaseNode;
    }): NodeRED.Link[];
    getType(type: string): any;
    id(): NodeRED.UID;
    add(node: any): NodeRED.BaseNode;
    remove(id: NodeRED.UID): {
      links: NodeRED.Link[];
      nodes: NodeRED.BaseNode[];
    };
  };

  /** Code editor (ACE/Monaco) */
  editor: {
    createEditor(options: NodeRED.EditorOptions): any;
    edit(node: NodeRED.Node, defaultTab?: any): void;
    editConfig(
      name: string,
      type: string,
      id: string,
      prefix?: string,
      editContext?: NodeRED.Node,
    ): void;
    prepareConfigNodeSelect(
      node: NodeRED.BaseNode,
      property: string,
      type: string,
      prefix?: string,
      filter?: (configNode: NodeRED.ConfigNode) => boolean,
    ): void;
    validateNode(node: NodeRED.BaseNode): boolean;
  };

  /** Side panel tray */
  tray: {
    show(options: NodeRED.TrayOptions): void;
    close(): void;
  };

  /** Popover / tooltip */
  popover: {
    create(options: NodeRED.PopoverOptions): NodeRED.PopoverInstance;
    tooltip(
      target: JQuery,
      text: string,
      direction?: string,
    ): NodeRED.TooltipInstance;
  };

  /** Toast notifications */
  notify(
    message: string | JQuery,
    options?: NodeRED.NotificationOptions,
  ): NodeRED.NotificationElement;

  /** Event system */
  events: {
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
  };

  /** Undo/redo */
  history: {
    push(event: any): void;
    pop(): any;
    peek(): any;
    list(): any[];
  };

  /** Keyboard shortcuts */
  keyboard: {
    add(scope: string, key: string, callback: () => void): void;
    remove(key: string): void;
  };

  /** Runtime communication (WebSocket) */
  comms: {
    subscribe(topic: string, callback: (topic: string, msg: any) => void): void;
    unsubscribe(
      topic: string,
      callback: (topic: string, msg: any) => void,
    ): void;
  };

  /** Editor settings */
  settings: {
    get(key: string): any;
    set(key: string, value: any): any;
    remove(key: string): any;
    [key: string]: any;
  };

  /** Canvas view */
  view: {
    focus(): void;
    selection(): { nodes?: NodeRED.Node[] };
    redraw(updateActive?: boolean): void;
  };

  /** Catch-all for untyped properties */
  [key: string]: any;
};
