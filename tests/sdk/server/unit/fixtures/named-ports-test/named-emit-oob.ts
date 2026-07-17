import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A single named port; on input it sends to a numeric index BEYOND the declared
// port count, proving an out-of-bounds numeric `sendToPort` produces a sparse
// emission (the target slot filled, the base port left empty).
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-oob:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NamedEmitOobInput = Input<Port<{ payload?: unknown }>>;
type NamedEmitOobOutputs = Outputs<{ success: Port<{ payload: string }> }>;

class NamedEmitOob extends IONode<
  Config,
  never,
  NamedEmitOobInput,
  NamedEmitOobOutputs
> {
  static override readonly type = "named-emit-oob";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send(5, { payload: "oob" });
  }
}

export default NamedEmitOob;
