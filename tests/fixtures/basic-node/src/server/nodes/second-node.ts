import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/second-node";

// Positional-output topology: a two-element `Output` tuple stamps two positional
// output ports (the old `outputsSchema: [Object, Object]`). The input port comes
// from the non-vacuous `Input` type.
type Config = Infer<typeof ConfigsSchema>;
type Input = Record<string, unknown>;
type Output = [unknown, unknown];

export default class SecondNode extends IONode<Config, never, Input, Output> {
  static override readonly type = "second-node";
  static override readonly category = "network";
  static override readonly color: `#${string}` = "#ff6633";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: Input) {
    this.send([msg, null]);
  }
}
