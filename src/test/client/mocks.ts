export interface MockEditor {
  getValue(): string;
  setValue(val: string): void;
  getSession(): { on(event: string, cb: (...args: any[]) => any): void };
  focus(): void;
  destroy(): void;
  saveView(): void;
  restoreView(): void;
}

export interface MockRED {
  _(key: string): string;
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
    tooltip(...args: any[]): {
      delete(): void;
      setAction(...args: any[]): void;
    };
  };
  nodes: {
    registerType(...args: any[]): void;
    node(...args: any[]): null;
    dirty(...args: any[]): boolean;
  };
  events: {
    on(...args: any[]): void;
    off(...args: any[]): void;
    emit(...args: any[]): void;
  };
  settings: Record<string, any>;
  notify(...args: any[]): void;
}

export function createRED(): MockRED {
  return {
    _: (key: string) => key,

    editor: {
      createEditor(options: any) {
        let currentValue = options.value || "";
        const session = {
          on(_event: string, _cb: (...args: any[]) => any) {},
        };
        return {
          getValue: () => currentValue,
          setValue: (val: string) => {
            currentValue = val;
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
      tooltip: () => ({ delete: () => {}, setAction: () => {} }),
    },

    nodes: {
      registerType: () => {},
      node: () => null,
      dirty: () => false,
    },

    events: {
      on: () => {},
      off: () => {},
      emit: () => {},
    },

    settings: {} as Record<string, any>,

    notify: () => {},
  };
}

interface JQState {
  typedInput: { value: string; type: string };
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
        state.typedInput = { value: "", type: action.default || "" };
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
      return jq;
    },

    on(event: string, cb: (...args: any[]) => any) {
      if (!state.listeners[event]) state.listeners[event] = [];
      state.listeners[event].push(cb);
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
