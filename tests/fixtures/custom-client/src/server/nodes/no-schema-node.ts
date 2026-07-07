import { IONode } from "@bonsae/nrg/server";

export default class NoSchemaNode extends IONode {
  static override readonly type = "no-schema-node";

  async input() {}
}
