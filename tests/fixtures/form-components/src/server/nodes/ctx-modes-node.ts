import { defineIONode, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/ctx-modes-node";

type Config = Infer<typeof ConfigsSchema>;

// Three positional output ports (from the Output tuple generic) → a 3-row
// Outputs table for the docs context-modes screenshot. The config's
// outputContextModes defaults ports 0 & 1 (editable Context Mode dropdowns),
// leaving port 2 locked to carry. No Input generic → no input port (matches the
// original, which declared no inputSchema).
type Output = [unknown, unknown, unknown];

export default defineIONode<Config, any, any, Output>({
  type: "ctx-modes-node",
  category: "function",
  color: "#c0deed",
  configSchema: ConfigsSchema,
  async input(msg) {
    this.send([msg, null, null]);
  },
});
