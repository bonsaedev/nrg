import { IONode } from "@bonsae/nrg/server";
import { type Schema, SchemaType, defineSchema } from "@bonsae/nrg/schema";

// Named-ports output schema — exercises server-resolved outputPortNames in the
// inliner (so the editor labels "success"/"failure" without guessing).
export default class RouterNode extends IONode {
  static override readonly type = "router-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = defineSchema(
    { name: SchemaType.String({ default: "" }) },
    { $id: "router-node:configs" },
  );
  static override readonly inputSchema: Schema = SchemaType.Object({});
  static override readonly outputsSchema = {
    success: SchemaType.Object({}),
    failure: SchemaType.Object({}),
  };

  async input(msg: any) {
    this.sendToPort("success", msg);
  }
}
