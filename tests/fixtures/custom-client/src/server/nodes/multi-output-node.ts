import { IONode } from "@bonsae/nrg/server";
import type { Port } from "@bonsae/nrg/server";

// Two positional output ports come from the `Output` tuple generic. Each element
// is a `Port<…>` (the OutputSpec contract) whose value type is nullable, so a
// `send([...])` can skip a port with `null`, matching Node-RED's positional-send
// semantics.
type Success = { result: string };
type Failure = { error: string; code: number };
type Output = readonly [Port<Success | null>, Port<Failure | null>];

export default class MultiOutputNode extends IONode<any, any, any, Output> {
  static override readonly type = "multi-output-node";

  async input() {
    this.send([{ result: "ok" }, null]);
  }
}
