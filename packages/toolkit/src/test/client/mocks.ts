export interface MockEditor {
  getValue(): string;
  setValue(val: string): void;
  getSession(): { on(event: string, cb: (...args: any[]) => any): void };
  focus(): void;
  destroy(): void;
  saveView(): void;
  restoreView(): void;
}

export interface MockNotification {
  update(msg: string, options?: Record<string, any>): void;
  close(): void;
}

export interface MockPopover {
  readonly element: null;
  open(): MockPopover;
  close(): MockPopover;
  setContent(content: any): MockPopover;
  move(options: Record<string, any>): void;
}

export interface MockTooltip extends MockPopover {
  delete(): void;
  setAction(action: string): void;
}

/**
 * Mirrors the real RED.settings: exportable settings appear as direct
 * properties, and get/set/remove manage user settings on the same store.
 */
export interface MockSettings {
  get(key: string): any;
  set(key: string, value: any): any;
  remove(key: string): any;
  [key: string]: any;
}

export interface MockRED {
  _(key: string, substitutions?: Record<string, string>): string;
  editor: {
    createEditor(options: any): MockEditor;
    prepareConfigNodeSelect(...args: any[]): void;
    validateNode(...args: any[]): boolean;
  };
  tray: {
    show(...args: any[]): void;
    close(): void;
  };
  popover: {
    create(options: any): MockPopover;
    tooltip(...args: any[]): MockTooltip;
  };
  nodes: {
    registerType(type: string, definition: any): void;
    getType(type: string): any;
    node(id: string): any;
    add(node: any): any;
    remove(id: string): { links: any[]; nodes: any[] };
    /** Test-only: empties the node registry. */
    clear(): void;
    eachNode(callback: (node: any) => void | false): void;
    eachConfig(callback: (node: any) => void | false): void;
    filterNodes(filter: { z?: string; type?: string }): any[];
    filterLinks(filter: { source?: any; target?: any }): any[];
    /** Test-only: registers a link for filterLinks lookups. */
    addLink(link: { source: any; target: any; sourcePort?: number }): void;
    dirty(): boolean;
    dirty(dirty: boolean): void;
    id(): string;
  };
  events: {
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener?: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
  };
  comms: {
    subscribe(topic: string, callback: (topic: string, msg: any) => void): void;
    unsubscribe(
      topic: string,
      callback: (topic: string, msg: any) => void,
    ): void;
    /** Test-only: simulates a runtime message. Supports `+` and `#` wildcards in subscriptions. */
    publish(topic: string, msg: any): void;
  };
  settings: MockSettings;
  notify(message: any, options?: Record<string, any>): MockNotification;
}

export function createSettings(): MockSettings {
  const settings: MockSettings = {
    get(key: string) {
      return settings[key];
    },
    set(key: string, value: any) {
      settings[key] = value;
      return value;
    },
    remove(key: string) {
      const value = settings[key];
      delete settings[key];
      return value;
    },
  };
  return settings;
}

/** MQTT-style topic match: `+` matches one segment, `#` matches the rest. */
function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  const p = pattern.split("/");
  const t = topic.split("/");
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "#") return true;
    if (i >= t.length) return false;
    if (p[i] !== "+" && p[i] !== t[i]) return false;
  }
  return p.length === t.length;
}

/**
 * Resets a mock RED's internal state (registries, listeners, subscriptions,
 * settings) without replacing the object — module-scope `const RED =
 * window.RED` captures in test files stay valid. Called from the built-in
 * setup's beforeEach.
 */
export function resetRED(red: MockRED): void {
  (red as any).__reset?.();
}

export function createRED(): MockRED {
  const nodeStore = new Map<string, any>();
  const typeRegistry = new Map<string, any>();
  const links: Array<{ source: any; target: any; sourcePort?: number }> = [];
  const eventListeners: Record<string, ((...args: any[]) => void)[]> = {};
  const commsSubscriptions: Array<{
    topic: string;
    callback: (topic: string, msg: any) => void;
  }> = [];
  let dirtyState = false;
  let idCounter = 0;

  const popoverInstance = (): MockPopover => {
    const instance: MockPopover = {
      element: null,
      open: () => instance,
      close: () => instance,
      setContent: () => instance,
      move: () => {},
    };
    return instance;
  };

  const red: MockRED = {
    _: (key: string) => key,

    editor: {
      createEditor(options: any) {
        let currentValue = options?.value || "";
        const sessionListeners: Record<string, ((...args: any[]) => any)[]> =
          {};
        const session = {
          on(event: string, cb: (...args: any[]) => any) {
            (sessionListeners[event] ??= []).push(cb);
          },
        };
        return {
          getValue: () => currentValue,
          setValue: (val: string) => {
            currentValue = val;
            // real ACE/Monaco sessions fire change on programmatic setValue
            (sessionListeners["change"] ?? []).forEach((cb) => cb());
          },
          getSession: () => session,
          focus: () => {},
          destroy: () => {},
          saveView: () => {},
          restoreView: () => {},
        };
      },
      prepareConfigNodeSelect: () => {},
      validateNode: () => true,
    },

    tray: {
      show: () => {},
      close: () => {},
    },

    popover: {
      create: () => popoverInstance(),
      tooltip: () => {
        const instance: MockTooltip = {
          element: null,
          open: () => instance,
          close: () => instance,
          setContent: () => instance,
          move: () => {},
          delete: () => {},
          setAction: () => {},
        };
        return instance;
      },
    },

    nodes: {
      registerType(type: string, definition: any) {
        typeRegistry.set(type, definition);
      },
      getType(type: string) {
        return typeRegistry.get(type) ?? null;
      },
      node(id: string) {
        return nodeStore.get(id) ?? null;
      },
      add(node: any) {
        nodeStore.set(node.id, node);
        return node;
      },
      remove(id: string) {
        const node = nodeStore.get(id);
        nodeStore.delete(id);
        return { links: [], nodes: node ? [node] : [] };
      },
      clear() {
        nodeStore.clear();
      },
      // The mock keeps a single registry: eachNode and eachConfig iterate the
      // same entries. Register whatever your component expects to find.
      eachNode(callback: (node: any) => void | false) {
        for (const node of nodeStore.values()) {
          if (callback(node) === false) break;
        }
      },
      eachConfig(callback: (node: any) => void | false) {
        for (const node of nodeStore.values()) {
          if (callback(node) === false) break;
        }
      },
      filterNodes(filter: { z?: string; type?: string }) {
        return [...nodeStore.values()].filter(
          (n) =>
            (filter.type === undefined || n.type === filter.type) &&
            (filter.z === undefined || n.z === filter.z),
        );
      },
      filterLinks(filter: { source?: any; target?: any }) {
        return links.filter(
          (l) =>
            (filter.source === undefined ||
              l.source === filter.source ||
              l.source?.id === filter.source?.id) &&
            (filter.target === undefined ||
              l.target === filter.target ||
              l.target?.id === filter.target?.id),
        );
      },
      addLink(link: { source: any; target: any; sourcePort?: number }) {
        links.push(link);
      },
      dirty(state?: boolean): any {
        if (state === undefined) return dirtyState;
        dirtyState = state;
      },
      id() {
        return (++idCounter).toString(16).padStart(16, "0");
      },
    },

    events: {
      on(event: string, listener: (...args: any[]) => void) {
        (eventListeners[event] ??= []).push(listener);
      },
      off(event: string, listener?: (...args: any[]) => void) {
        if (!eventListeners[event]) return;
        if (listener) {
          eventListeners[event] = eventListeners[event].filter(
            (l) => l !== listener,
          );
        } else {
          delete eventListeners[event];
        }
      },
      emit(event: string, ...args: any[]) {
        [...(eventListeners[event] ?? [])].forEach((cb) => cb(...args));
      },
    },

    comms: {
      subscribe(topic: string, callback: (topic: string, msg: any) => void) {
        commsSubscriptions.push({ topic, callback });
      },
      unsubscribe(topic: string, callback: (topic: string, msg: any) => void) {
        const index = commsSubscriptions.findIndex(
          (s) => s.topic === topic && s.callback === callback,
        );
        if (index !== -1) commsSubscriptions.splice(index, 1);
      },
      publish(topic: string, msg: any) {
        [...commsSubscriptions]
          .filter((s) => topicMatches(s.topic, topic))
          .forEach((s) => s.callback(topic, msg));
      },
    },

    settings: createSettings(),

    notify: () => ({
      update: () => {},
      close: () => {},
    }),
  };

  Object.defineProperty(red, "__reset", {
    enumerable: false,
    value: () => {
      nodeStore.clear();
      typeRegistry.clear();
      links.length = 0;
      for (const key of Object.keys(eventListeners)) {
        delete eventListeners[key];
      }
      commsSubscriptions.length = 0;
      dirtyState = false;
      red.settings = createSettings();
    },
  });

  return red;
}

interface JQState {
  typedInput: {
    value: string;
    type: string;
    types?: any[];
    disabled?: boolean;
    hidden?: boolean;
    width?: string | number;
  };
  listeners: Record<string, ((...args: any[]) => any)[]>;
}

function ensureState(el: Element | null): JQState {
  if (el && !(el as any).__jqState) {
    (el as any).__jqState = {
      typedInput: { value: "", type: "" },
      listeners: {},
    };
  }
  return el
    ? (el as any).__jqState
    : { typedInput: { value: "", type: "" }, listeners: {} };
}

function createJQ(el: Element | null): any {
  const state = ensureState(el);

  const jq: any = {
    0: el,
    length: el ? 1 : 0,

    typedInput(action: any, value?: any) {
      if (typeof action === "object") {
        state.typedInput = {
          value: "",
          type: action.default || "",
          types: action.types,
        };
        return jq;
      }
      if (action === "value") {
        if (value !== undefined) {
          state.typedInput.value = String(value);
          if (el) el.setAttribute("value", String(value));
          return undefined;
        }
        return state.typedInput.value;
      }
      if (action === "type") {
        if (value !== undefined) {
          state.typedInput.type = String(value);
          return undefined;
        }
        return state.typedInput.type;
      }
      if (action === "types") {
        state.typedInput.types = value;
        return undefined;
      }
      if (action === "validate") {
        return true;
      }
      if (action === "disable") {
        state.typedInput.disabled = value !== false;
        return undefined;
      }
      if (action === "enable") {
        state.typedInput.disabled = false;
        return undefined;
      }
      if (action === "hide") {
        state.typedInput.hidden = true;
        return undefined;
      }
      if (action === "show") {
        state.typedInput.hidden = false;
        return undefined;
      }
      if (action === "width") {
        state.typedInput.width = value;
        return undefined;
      }
      if (action === "focus") {
        return undefined;
      }
      return jq;
    },

    on(event: string, cb: (...args: any[]) => any) {
      if (!state.listeners[event]) state.listeners[event] = [];
      state.listeners[event].push(cb);
      return jq;
    },

    off(event?: string) {
      if (event) {
        delete state.listeners[event];
      } else {
        for (const key of Object.keys(state.listeners)) {
          delete state.listeners[key];
        }
      }
      return jq;
    },

    val(value?: any) {
      if (value !== undefined) {
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement
        ) {
          el.value = String(value);
        }
        return jq;
      }
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        return el.value;
      }
      return "";
    },

    find(selector: string) {
      return createJQ(el?.querySelector(selector) ?? null);
    },

    append(child: any) {
      const childEl = child?.[0] || child;
      if (el && childEl instanceof Element) el.appendChild(childEl);
      return jq;
    },

    appendTo(target: any) {
      const t = target?.[0] || target;
      if (t instanceof Element && el) t.appendChild(el);
      return jq;
    },

    html(content: string) {
      if (el) el.innerHTML = content;
      return jq;
    },

    empty() {
      if (el) el.innerHTML = "";
      return jq;
    },

    i18n() {
      return jq;
    },

    addClass(cls: string) {
      el?.classList.add(cls);
      return jq;
    },

    removeClass(cls: string) {
      el?.classList.remove(cls);
      return jq;
    },

    __trigger(event: string) {
      (state.listeners[event] || []).forEach((cb) => cb());
    },
  };

  return jq;
}

export function createJQuery(): (
  selector: any,
  attrs?: Record<string, any>,
) => any {
  return function $(selector: any, attrs?: Record<string, any>): any {
    if (typeof selector === "string") {
      if (selector.trim().startsWith("<")) {
        const tpl = document.createElement("template");
        tpl.innerHTML = selector.trim();
        const el = tpl.content.firstElementChild;
        if (el && attrs) {
          for (const [key, value] of Object.entries(attrs)) {
            if (key === "html") {
              el.innerHTML = String(value);
            } else {
              el.setAttribute(key, String(value));
            }
          }
        }
        return createJQ(el);
      }
      return createJQ(document.querySelector(selector));
    }
    if (selector instanceof Element) return createJQ(selector);
    if (selector && typeof selector === "object" && selector.nodeType)
      return createJQ(selector as unknown as Element);
    return createJQ(null);
  };
}
