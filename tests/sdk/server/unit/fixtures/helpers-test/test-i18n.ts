import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// A types-first node that resolves an i18n key and emits it. One input port and
// one named output port come from the generics.
type TestI18nNodeInput = Input<Port<{ payload?: unknown }>>;
type TestI18nNodeOutputs = Outputs<{ out: Port<{ payload: string }> }>;

class TestI18nNode extends IONode<
  any,
  Record<string, never>,
  TestI18nNodeInput,
  TestI18nNodeOutputs
> {
  static override readonly type = "test-i18n";
  static override readonly category = "function";

  override async input(_msg: TestI18nNodeInput) {
    const label = this.i18n("greeting");
    this.send("out", { payload: label });
  }
}

export default TestI18nNode;
