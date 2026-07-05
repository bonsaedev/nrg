import { defineIONode } from "@bonsae/nrg/server";
import { SchemaType } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/output-schema-node";

// Two output ports + an `outputSchemas` config declaration → the editor renders
// a Schema column whose button opens a Monaco (JSON) tray to set a port's
// data-validation schema. Exercises the per-port output schema editor e2e.
export default defineIONode({
  type: "output-schema-node",
  category: "function",
  color: "#c0deed",
  configSchema: ConfigsSchema,
  outputsSchema: [SchemaType.Object({}), SchemaType.Object({})],
  async input(msg) {
    this.send([msg, null]);
  },
});
