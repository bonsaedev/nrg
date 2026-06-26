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
 * Reset a mock RED's internal state (registries, listeners, subscriptions,
 * settings) in place, WITHOUT replacing the object. The setup's beforeEach
 * calls this instead of reassigning `window.RED = createRED()` on purpose: test
 * files capture the RED reference — and the spies installed on it — once at
 * collection time, both as `const RED = window.RED` and, more commonly, via the
 * `const { RED } = createNode()` the component harness returns at describe-body
 * scope. Swapping the object would orphan those captures: the component under
 * test would call the fresh `window.RED` while the test asserts on the stale
 * one. Keeping the same object and only clearing its state keeps both sides on
 * one RED.
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
