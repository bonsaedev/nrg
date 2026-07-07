import { IONode } from "@/sdk/lib/server";

// A types-first node exercising the node/flow/global context stores. One input
// port and one output port come from the generics.
type Input = { scope?: string };
type Output = { payload: unknown };

class TestContextNode extends IONode<
  any,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "test-context";
  static override readonly category = "function";

  override async created() {
    await this.context.node.set("counter", 0);
    await this.context.flow.set("sharedKey", "flow-value");
    await this.context.global.set("globalKey", "global-value");
  }

  override async input(msg: Input) {
    const scope = msg.scope;
    if (scope === "flow") {
      const val = await this.context.flow.get<string>("sharedKey");
      this.send({ payload: val });
    } else if (scope === "global") {
      const val = await this.context.global.get<string>("globalKey");
      this.send({ payload: val });
    } else {
      const count = (await this.context.node.get<number>("counter")) ?? 0;
      await this.context.node.set("counter", count + 1);
      this.send({ payload: count + 1 });
    }
  }
}

export default TestContextNode;
