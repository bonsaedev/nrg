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

/** Reserved config property names for built-in ports (error, complete, status) */
const BUILTIN_PORT_KEYS = ["errorPort", "completePort", "statusPort"] as const;

export { BUILTIN_PORT_KEYS, TYPED_INPUT_TYPES };
