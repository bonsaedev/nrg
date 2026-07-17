import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// The SENDER side of the `msg[Meta]` demo: it does NOTHING about Meta — the
// framework stamps the provenance (producing node + port) on every send.
type MetaSenderInput = Input<Port<{ payload: string }>>;
type MetaSenderOutputs = Outputs<{ out: Port<{ greeting: string }> }>;

class MetaSender extends IONode<
  never,
  never,
  MetaSenderInput,
  MetaSenderOutputs
> {
  static override readonly type = "meta-sender";

  override async input(msg: MetaSenderInput) {
    this.send("out", { greeting: `hi ${msg.payload}` });
  }
}

export default MetaSender;
