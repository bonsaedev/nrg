import { IONode } from "@bonsae/nrg/server";
import { SchemaType, type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "../schemas/second-node";

export default class SecondNode extends IONode {
  static override readonly type = "second-node";
  static override readonly category = "network";
  static override readonly color: `#${string}` = "#ff6633";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly inputSchema: Schema = SchemaType.Object({});
  static override readonly outputsSchema: Schema[] = [
    SchemaType.Object({}),
    SchemaType.Object({}),
  ];

  async input(msg: any) {
    this.send([msg, null]);
  }
}
