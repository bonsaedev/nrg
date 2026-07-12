import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with ONE input port and ONE untyped output port named
// "out" (Output = a single-key `Port<unknown>` record) — both derived purely
// from the generics, with no inputSchema/outputsSchema. The input handler echoes
// the incoming payload, so a test can drive output validation either directly
// (`node.send("out", ...)` on a stamped instance) or end-to-end through
// `receive()`. Data validation is config-driven: tests pass
// `validateInput`/`inputSchema` and `validateOutputs`/`outputSchemas` per case —
// there are no static validation schemas anymore.
type SingleOutputInput = Input<Port<{ payload?: unknown }>>;
type SingleOutputOutputs = Outputs<{ out: Port<unknown> }>;

class SingleOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  SingleOutputInput,
  SingleOutputOutputs
> {
  static override readonly type = "single-output";

  override async input(msg: SingleOutputInput) {
    this.send("out", msg.payload);
  }
}

export default SingleOutput;
