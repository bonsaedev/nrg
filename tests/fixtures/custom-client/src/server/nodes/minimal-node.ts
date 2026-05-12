import { defineIONode } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/minimal-node";

export default defineIONode({
  type: "minimal-node",
  configSchema: ConfigsSchema,
  async input() {},
});
