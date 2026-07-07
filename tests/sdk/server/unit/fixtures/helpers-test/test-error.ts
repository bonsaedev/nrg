import { IONode } from "@/sdk/lib/server";

// A types-first node that always throws from its input handler — proves the
// harness surfaces the failure (rejects `receive`, records `error`). Its single
// input port comes from the `Input` generic; it declares no output.
type Input = { payload?: unknown };

class TestErrorNode extends IONode<any, Record<string, never>, Input> {
  static override readonly type = "test-error";
  static override readonly category = "function";

  override async input(_msg: Input) {
    throw new Error("something broke");
  }
}

export default TestErrorNode;
