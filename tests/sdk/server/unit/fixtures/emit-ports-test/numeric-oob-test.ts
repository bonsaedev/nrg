import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node with exactly ONE base output port (index 0). It deliberately
// sends to numeric index 1 — which, with the error port enabled, is the
// framework-managed error slot. The runtime must reject this out-of-range numeric
// send instead of silently overwriting the error frame.
const ConfigSchema = defineSchema(
  {
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
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
    // Index 1 is out of range for a single-base-output node; with the error port
    // enabled it is the error slot. The runtime must reject this.
    this.send(1, { x: 1 });
  }
}

export default NumericOob;
