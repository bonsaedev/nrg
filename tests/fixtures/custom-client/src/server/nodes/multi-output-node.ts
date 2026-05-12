import { defineIONode } from "@bonsae/nrg/server";
import { SuccessSchema, ErrorSchema } from "../schemas/multi-output-node";

export default defineIONode({
  type: "multi-output-node",
  outputsSchema: [SuccessSchema, ErrorSchema],
  async input() {
    this.send([{ result: "ok" }, null]);
  },
});
