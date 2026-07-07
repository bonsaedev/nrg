import { defineIONode } from "@/sdk/lib/server";

// A types-first functional-API node with DEFAULT metadata: no category/color are
// set, so the factory's defaults ("function" / "#a6bbcf") apply. Its ONE input
// port and ONE output port come purely from the Input/Output generics — there is
// no inputSchema/outputsSchema. Proves `defineIONode` + the topology injector
// derive inputs=1 / outputs=1 from the types alone.
type Input = { payload?: unknown };
type Output = { result: string };

const DefaultsIO = defineIONode<any, any, Input, Output>({
  type: "defaults-io",
  input(msg) {
    this.send({ result: String(msg.payload) });
  },
});

export default DefaultsIO;
