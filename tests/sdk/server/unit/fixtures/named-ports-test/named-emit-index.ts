import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Two named ports; on input it routes to port 0 by NUMERIC INDEX (rather than
// by name), proving numeric addressing works on a named-port node.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-index:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NamedEmitIndexInput = Input<Port<{ payload?: unknown }>>;
type NamedEmitIndexOutputs = Outputs<{
  success: Port<{ payload: string }>;
  failure: Port<{ payload: { reason: string } }>;
}>;

class NamedEmitIndex extends IONode<
  Config,
  Record<string, never>,
  NamedEmitIndexInput,
  NamedEmitIndexOutputs
> {
  static override readonly type = "named-emit-index";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send(0, { payload: "by-index" });
  }
}

export default NamedEmitIndex;
