// jQuery mock for the client test harness. The Node-RED editor exposes jQuery as
// `$`, and nodes/form components call into it heavily, so the unit and component
// test setups install this as `window.$`. Per-element state (typed-input value,
// registered listeners) is stashed on `el.__jqState` so component tests can read
// back what a node did via getJQueryState().

export interface MockJQueryState {
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

/**
 * The jQuery-like wrapper returned for a matched element. Loosely typed on
 * purpose: the mock implements only the surface Node-RED form code touches.
 */
export interface MockJQueryElement {
  0: Element | null;
  length: number;
  [method: string]: any;
}

/** The `$` function the harness installs on `window`. */
export type MockJQuery = (
  selector: any,
  attrs?: Record<string, any>,
) => MockJQueryElement;

function emptyState(): MockJQueryState {
  return { typedInput: { value: "", type: "" }, listeners: {} };
}

function ensureJQueryState(el: Element | null): MockJQueryState {
  if (el && !(el as any).__jqState) {
    (el as any).__jqState = emptyState();
  }
  return el ? (el as any).__jqState : emptyState();
}

/** Read the state a node left on an element (for component-test assertions). */
export function getJQueryState(element: Element): MockJQueryState {
  return (element as any).__jqState ?? emptyState();
}

function createJQueryElement(el: Element | null): MockJQueryElement {
  const state = ensureJQueryState(el);

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
      return createJQueryElement(el?.querySelector(selector) ?? null);
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

/** Build the `$` function the test harness assigns to `window.$`. */
export function createJQuery(): MockJQuery {
  return function $(
    selector: any,
    attrs?: Record<string, any>,
  ): MockJQueryElement {
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
        return createJQueryElement(el);
      }
      return createJQueryElement(document.querySelector(selector));
    }
    if (selector instanceof Element) return createJQueryElement(selector);
    if (selector && typeof selector === "object" && selector.nodeType)
      return createJQueryElement(selector as unknown as Element);
    return createJQueryElement(null);
  };
}
