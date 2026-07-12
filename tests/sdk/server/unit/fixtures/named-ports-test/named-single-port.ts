import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node with a SINGLE object output (one unnamed port) — no named
// ports. Proves baseOutputs === 1 and that `sendToPort("name")` fails loudly
// ("no named output ports") on a node with no named-port topology.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-single-port:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NamedSinglePortInput = Input<Port<{ payload?: unknown }>>;
type NamedSinglePortOutputs = Outputs<{ out: Port<{ payload: string }> }>;

class NamedSinglePort extends IONode<
  Config,
  Record<string, never>,
  NamedSinglePortInput,
  NamedSinglePortOutputs
> {
  static override readonly type = "named-single-port";
  static override readonly configSchema = ConfigSchema;

  override async input() {}
}

export default NamedSinglePort;
