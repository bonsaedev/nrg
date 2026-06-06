interface JQState {
  typedInput: { value: string; type: string };
  listeners: Record<string, ((...args: any[]) => any)[]>;
}

export function getJQueryState(element: Element): JQState {
  return (
    (element as any).__jqState ?? {
      typedInput: { value: "", type: "" },
      listeners: {},
    }
  );
}

export function triggerJQueryEvent(element: Element, event: string): void {
  const state = (element as any).__jqState;
  if (state?.listeners[event]) {
    state.listeners[event].forEach((cb: (...args: any[]) => any) => cb());
  }
}
