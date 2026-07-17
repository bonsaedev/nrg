import { IONode, type Input, type Port } from "@/sdk/lib/server";

// A types-first node that always throws from its input handler — proves the
// harness surfaces the failure (rejects `receive`, records `error`). Its single
// input port comes from the `Input` generic; it declares no output.
type TestErrorNodeInput = Input<Port<{ payload?: unknown }>>;

class TestErrorNode extends IONode<any, never, TestErrorNodeInput> {
  static override readonly type = "test-error";
  static override readonly category = "function";

  override async input(_msg: TestErrorNodeInput) {
    throw new Error("something broke");
  }
}

export default TestErrorNode;
