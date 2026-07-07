import { IONode } from "@/sdk/lib/server";

// A types-first node that resolves an i18n key and emits it. One input port and
// one output port come from the generics.
type Input = { payload?: unknown };
type Output = { payload: string };

class TestI18nNode extends IONode<any, Record<string, never>, Input, Output> {
  static override readonly type = "test-i18n";
  static override readonly category = "function";

  override async input(_msg: Input) {
    const label = this.i18n("greeting");
    this.send({ payload: label });
  }
}

export default TestI18nNode;
