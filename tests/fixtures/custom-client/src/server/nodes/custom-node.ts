import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/custom-node";

type Config = Infer<typeof ConfigsSchema>;
type Input = { payload: string };
type Output = { result: string; timestamp: number };

export default class CustomNode extends IONode<Config, any, Input, Output> {
  static override readonly type = "custom-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#33cc99";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: Input) {
    this.send({ result: msg.payload, timestamp: Date.now() });
  }
}
