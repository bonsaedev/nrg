import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Relays a fixed marker on every input. Its single input port (from the `Input`
// generic) is what lets an upstream node's wire deliver here.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "relay:config" },
);

type Config = Infer<typeof ConfigSchema>;
type RelayInput = Input<Port<{ payload?: unknown }>>;
type RelayOutputs = Outputs<{ out: Port<{ relayed: boolean }> }>;

class Relay extends IONode<Config, never, RelayInput, RelayOutputs> {
  static override readonly type = "relay";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("out", { relayed: true });
  }
}

export default Relay;
