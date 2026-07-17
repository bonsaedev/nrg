import {
  IONode,
  Meta,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";

// The RECEIVER side of the `msg[Meta]` demo: reads the upstream provenance off
// `msg[Meta].source` — typed `MessageSource | undefined`, no cast — because the
// framework installs the symbol accessor on the incoming message at delivery
// (exactly like `msg[Channels]`). `undefined` = the upstream wasn't an nrg node.
type MetaReceiverInput = Input<Port<{ greeting?: string }>>;
type MetaReceiverOutputs = Outputs<{
  out: Port<{ producedBy: string; fromPort: number | undefined }>;
}>;

class MetaReceiver extends IONode<
  never,
  never,
  MetaReceiverInput,
  MetaReceiverOutputs
> {
  static override readonly type = "meta-receiver";

  override async input(msg: MetaReceiverInput) {
    const src = msg[Meta].source; // typed MessageSource | undefined — no cast
    this.send("out", {
      producedBy: src?.id ?? "non-nrg",
      fromPort: src?.port,
    });
  }
}

export default MetaReceiver;
