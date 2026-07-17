import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// A types-first node exercising the node/flow/global context stores. One input
// port and one named output port come from the generics.
type TestContextNodeInput = Input<Port<{ scope?: string }>>;
type TestContextNodeOutputs = Outputs<{ out: Port<{ payload: unknown }> }>;

class TestContextNode extends IONode<
  any,
  never,
  TestContextNodeInput,
  TestContextNodeOutputs
> {
  static override readonly type = "test-context";
  static override readonly category = "function";

  override async created() {
    await this.context.node.set("counter", 0);
    await this.context.flow.set("sharedKey", "flow-value");
    await this.context.global.set("globalKey", "global-value");
  }

  override async input(msg: TestContextNodeInput) {
    const scope = msg.scope;
    if (scope === "flow") {
      const val = await this.context.flow.get<string>("sharedKey");
      this.send("out", { payload: val });
    } else if (scope === "global") {
      const val = await this.context.global.get<string>("globalKey");
      this.send("out", { payload: val });
    } else {
      const count = (await this.context.node.get<number>("counter")) ?? 0;
      await this.context.node.set("counter", count + 1);
      this.send("out", { payload: count + 1 });
    }
  }
}

export default TestContextNode;
