import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";

// A types-first multi-output node: two named output ports (no outputsSchema).
// Routes a message to port `out0` or `out1` based on a config threshold — a null
// slot leaves the other port empty.
const SplitterSchema = defineSchema(
  {
    name: SchemaType.String({ default: "splitter" }),
    threshold: SchemaType.Number({ default: 50 }),
  },
  { $id: "test-helpers:splitter-config" },
);

type SplitterConfig = Infer<typeof SplitterSchema>;
type TestSplitterInput = Input<Port<{ payload: number }>>;
type OutMsg = { payload: number; label: string };
type TestSplitterOutputs = Outputs<{
  out0: Port<OutMsg | null>;
  out1: Port<OutMsg | null>;
}>;

class TestSplitter extends IONode<
  SplitterConfig,
  never,
  TestSplitterInput,
  TestSplitterOutputs
> {
  static override readonly type = "test-splitter";
  static override readonly category = "function";
  static override readonly configSchema: Schema = SplitterSchema;

  override async input(msg: TestSplitterInput) {
    if (msg.payload > this.config.threshold) {
      this.send("out0", { payload: msg.payload, label: "above" });
      this.send("out1", null);
    } else {
      this.send("out0", null);
      this.send("out1", { payload: msg.payload, label: "below" });
    }
  }
}

export default TestSplitter;
