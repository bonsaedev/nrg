import { IONode, type Schema } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/second-node";

export default class SecondNode extends IONode {
  static override readonly type = "second-node";
  static override readonly category = "network";
  static override readonly color: `#${string}` = "#ff6633";
  static override readonly inputs = 1;
  static override readonly outputs = 2;
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: any) {
    this.send([msg, null]);
  }
}
