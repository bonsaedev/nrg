import { IONode } from "@/sdk/lib/server";

// Types-first fixture with ONE input port and ONE untyped output port
// (Output = unknown) — both derived purely from the generics, with no
// inputSchema/outputsSchema. The input handler echoes the incoming payload, so a
// test can drive output validation either directly (`node.send(...)` on a stamped
// instance) or end-to-end through `receive()`. Data validation is config-driven:
// tests pass `validateInput`/`inputSchema` and `validateOutputs`/`outputSchemas`
// per case — there are no static validation schemas anymore.
type Input = { payload?: unknown };
type Output = unknown;

class SingleOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "single-output";

  override async input(msg: Input) {
    this.send(msg.payload);
  }
}

export default SingleOutput;
