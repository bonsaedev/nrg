import { IONode, type Schema } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/custom-node";

export default class CustomNode extends IONode {
  static override readonly type = "custom-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#33cc99";
  static override readonly inputs = 1;
  static override readonly outputs = 1;
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: any) {
    this.send(msg);
  }
}
