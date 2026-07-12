import { IONode, type Input, type Port } from "@/sdk/lib/server";

// A types-only node whose Input generic is typed → exactly ONE input port. Proves
// the input-port count is derived from the `Input` generic, not from any schema
// (there is none). The extractor stamps `__nrgPorts` from these generics.
type WithInputInput = Input<Port<{ payload?: unknown }>>;

class WithInput extends IONode<any, any, WithInputInput, any> {
  static override readonly type = "with-input";
  static override readonly category = "function";

  override async input(_msg: WithInputInput) {}
}

export default WithInput;
