import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/ctx-modes-node";

type Config = Infer<typeof ConfigsSchema>;

// Three positional output ports (from the Output tuple generic) → a 3-row
// Outputs table for the docs context-modes screenshot. The config's
// outputContextModes defaults ports 0 & 1; every port's Context Mode dropdown is
// editable (context mode is always configurable). No Input generic → no input
// port.
type Output = [unknown, unknown, unknown];

export default class CtxModesNode extends IONode<Config, any, any, Output> {
  static override readonly type = "ctx-modes-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#c0deed";
  static override readonly configSchema: Schema = ConfigsSchema;

  async input(msg: unknown) {
    this.send([msg, null, null]);
  }
}
