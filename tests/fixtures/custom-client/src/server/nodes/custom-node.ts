import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/custom-node";

type Config = Infer<typeof ConfigsSchema>;
type CustomInput = Input<Port<{ payload: string }>>;
type CustomOutput = Outputs<{
  out: Port<{ result: string; timestamp: number }>;
}>;

export default class CustomNode extends IONode<
  Config,
  any,
  CustomInput,
  CustomOutput
> {
  static override readonly type = "custom-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#33cc99";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: CustomInput) {
    this.send("out", { result: msg.payload, timestamp: Date.now() });
  }
}
