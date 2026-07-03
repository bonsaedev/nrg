const TYPED_INPUT_TYPES = [
  "msg",
  "flow",
  "global",
  "str",
  "num",
  "bool",
  "json",
  "bin",
  "re",
  "jsonata",
  "date",
  "env",
  "node",
  "cred",
] as const;

/** The Node-RED TypedInput type identifiers as a union: `"msg" | "flow" | …`. */
type TypedInputType = (typeof TYPED_INPUT_TYPES)[number];

/** Reserved config property names for built-in ports (error, complete, status) */
const BUILTIN_PORT_KEYS = ["errorPort", "completePort", "statusPort"] as const;

export { BUILTIN_PORT_KEYS, TYPED_INPUT_TYPES };
export type { TypedInputType };
