/**
 * Browser test setup — provides jQuery and RED mocks that the Vue form
 * components expect as globals in the Node-RED editor environment.
 */

// ---------------------------------------------------------------------------
// jQuery mock
// ---------------------------------------------------------------------------

interface JQState {
  typedInput: { value: string; type: string };
  listeners: Record<string, Function[]>;
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

    on(event: string, cb: Function) {
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

    // Test helper — fire all jQuery-registered callbacks for `event`.
    __trigger(event: string) {
      (state.listeners[event] || []).forEach((cb) => cb());
    },
  };

  return jq;
}

function $(selector: any): any {
  if (typeof selector === "string") {
    if (selector.trim().startsWith("<")) {
      const tpl = document.createElement("template");
      tpl.innerHTML = selector.trim();
      return createJQ(tpl.content.firstElementChild);
    }
    return createJQ(document.querySelector(selector));
  }
  if (selector instanceof Element) return createJQ(selector);
  if (selector && typeof selector === "object" && selector.nodeType)
    return createJQ(selector as unknown as Element);
  return createJQ(null);
}

// ---------------------------------------------------------------------------
// RED mock
// ---------------------------------------------------------------------------

const RED = {
  _: (key: string) => key,

  editor: {
    createEditor(options: any) {
      let currentValue = options.value || "";
      const sessionCbs: Record<string, Function> = {};
      return {
        getValue: () => currentValue,
        setValue: (val: string) => {
          currentValue = val;
        },
        getSession: () => ({
          on: (event: string, cb: Function) => {
            sessionCbs[event] = cb;
          },
        }),
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
};

// ---------------------------------------------------------------------------
// Install globals
// ---------------------------------------------------------------------------

(window as any).$ = $;
(window as any).RED = RED;
