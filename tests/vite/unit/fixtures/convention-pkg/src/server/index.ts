// A throwaway package registry at the conventional src/server entry, used to
// prove loadRegistry() resolves and imports it under a given cwd. Deliberately
// import-free (no aliases) so it loads as a plain dynamic import.
class ConventionNode {
  static type = "convention-node";
  static configSchema = {
    type: "object",
    properties: { name: { type: "string", minLength: 1 } },
  };
  static credentialsSchema = {
    type: "object",
    properties: { token: { type: "string" } },
  };
}

export default { nodes: [ConventionNode] };
