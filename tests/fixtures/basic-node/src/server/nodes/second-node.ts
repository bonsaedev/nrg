import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/second-node";

// Positional-output topology: a two-element `Port` tuple stamps two positional
// output ports. The input port comes from the non-vacuous `Input` type.
type Config = Infer<typeof ConfigsSchema>;
type SecondInput = Input<Port<Record<string, unknown>>>;
type SecondOutput = Outputs<[Port<unknown>, Port<unknown>]>;

export default class SecondNode extends IONode<
  Config,
  never,
  SecondInput,
  SecondOutput
> {
  static override readonly type = "second-node";
  static override readonly category = "network";
  static override readonly color: `#${string}` = "#ff6633";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: SecondInput) {
    this.send(0, msg);
  }
}
