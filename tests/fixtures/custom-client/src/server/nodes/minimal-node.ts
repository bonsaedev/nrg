import { IONode } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/minimal-node";

export default class MinimalNode extends IONode {
  static override readonly type = "minimal-node";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input() {}
}
