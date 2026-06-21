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

export function getJQueryState(element: Element): JQState {
  return (
    (element as any).__jqState ?? {
      typedInput: { value: "", type: "" },
      listeners: {},
    }
  );
}
