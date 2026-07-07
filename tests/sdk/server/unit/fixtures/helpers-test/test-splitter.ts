import { IONode, type Infer } from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";

// A types-first multi-output node: two positional output ports come from the
// `Output` tuple generic (no outputsSchema). Routes a message to port 0 or port 1
// based on a config threshold — a null slot leaves the other port empty.
const SplitterSchema = defineSchema(
  {
    name: SchemaType.String({ default: "splitter" }),
    threshold: SchemaType.Number({ default: 50 }),
  },
  { $id: "test-helpers:splitter-config" },
);

type SplitterConfig = Infer<typeof SplitterSchema>;
type Input = { payload: number };
type OutMsg = { payload: number; label: string };
type Output = [OutMsg | null, OutMsg | null];

class TestSplitter extends IONode<
  SplitterConfig,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "test-splitter";
  static override readonly category = "function";
  static override readonly configSchema: Schema = SplitterSchema;

  override async input(msg: Input) {
    if (msg.payload > this.config.threshold) {
      this.send([{ payload: msg.payload, label: "above" }, null]);
    } else {
      this.send([null, { payload: msg.payload, label: "below" }]);
    }
  }
}

export default TestSplitter;
