import { defineIONode } from "@bonsae/nrg/server";
import { ConfigsSchema, InputSchema, OutputSchema } from "../schemas/custom-node";

export default defineIONode({
  type: "custom-node",
  category: "function",
  color: "#33cc99",
  inputs: 1,
  outputs: 1,
  configSchema: ConfigsSchema,
  inputSchema: InputSchema,
  outputsSchema: OutputSchema,

  async input(msg) {
    this.send({ result: msg.payload, timestamp: Date.now() });
  },
});
