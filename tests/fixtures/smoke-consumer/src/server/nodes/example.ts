import { defineIONode } from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/example";

export default defineIONode({
  type: "example-node",
  category: "function",
  color: "#a6bbcf",
  configSchema: ConfigsSchema,
  async input(msg) {
    this.send(msg);
  },
});
