import { defineIONode } from "@bonsae/nrg/server";
import { SchemaType } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "../schemas/ctx-modes-node";

// Three positional output ports → a 3-row Outputs table for the docs
// context-modes screenshot. The config's outputContextModes defaults ports 0 & 1
// (editable Context Mode dropdowns), leaving port 2 locked to carry.
export default defineIONode({
  type: "ctx-modes-node",
  category: "function",
  color: "#c0deed",
  configSchema: ConfigsSchema,
  outputsSchema: [
    SchemaType.Object({}),
    SchemaType.Object({}),
    SchemaType.Object({}),
  ],
  async input(msg) {
    this.send([msg, null, null]);
  },
});
