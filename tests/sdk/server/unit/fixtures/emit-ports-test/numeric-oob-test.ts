import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node with exactly ONE base output port (index 0). It sends to a
// configurable numeric index (`targetPort`, default 1) so a test can exercise
// both rejected numeric paths: an index that lands in a framework-managed
// built-in slot (e.g. the error slot at index 1) and a negative/non-integer one.
const ConfigSchema = defineSchema(
  {
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
    targetPort: SchemaType.Number({ default: 1 }),
  },
  { $id: "emit-ports-test:numeric-oob-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NumericOobInput = Input<Port<{ payload?: unknown }>>;
type NumericOobOutputs = Outputs<{ out: Port<{ x: number }> }>;

class NumericOob extends IONode<
  Config,
  Record<string, never>,
  NumericOobInput,
  NumericOobOutputs
> {
  static override readonly type = "numeric-oob-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    // The runtime must reject this out-of-range numeric send instead of silently
    // overwriting a built-in frame (or writing a sparse/invalid slot).
    this.send(this.config.targetPort, { x: 1 });
  }
}

export default NumericOob;
