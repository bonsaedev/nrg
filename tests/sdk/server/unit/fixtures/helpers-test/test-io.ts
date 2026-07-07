import { IONode, type Infer, type RED } from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";
import type TestConfigNode from "./test-config";

// A types-first IO node: its single input port comes from the `Input` generic and
// its single output port from the `Output` generic (no inputSchema/outputsSchema).
// The config schema still drives the editor form + config validation, including a
// NodeRef to the `test-config` config node.
const TestIOSchema = defineSchema(
  {
    name: SchemaType.String({ default: "test-io" }),
    server: SchemaType.NodeRef<TestConfigNode>("test-config"),
    greeting: SchemaType.String({ default: "hello" }),
  },
  { $id: "test-helpers:io-config" },
);

type TestIOConfig = Infer<typeof TestIOSchema>;
type Input = { payload?: unknown };
type Output = { payload: string };

class TestIONode extends IONode<
  TestIOConfig,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "test-io";
  static override readonly category = "function";
  static override readonly configSchema: Schema = TestIOSchema;
  static registeredCalled = false;

  static override async registered(RED: RED) {
    TestIONode.registeredCalled = true;
    RED.log.info("test-io registered");
  }

  override async created() {
    this.log("io node created");
  }

  override async input(msg: Input) {
    const greeting = this.config.greeting;
    this.send({ payload: `${greeting} ${msg.payload}` });
    this.status({ fill: "green", text: "ok" });
  }

  override async closed() {
    this.log("io node closed");
  }
}

export default TestIONode;
