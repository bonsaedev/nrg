import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A node whose output is genuinely dynamic: an explicit `unknown` output declares
// ONE untyped port (no schema). Proves the extractor treats `unknown` as a port,
// not as "no output".
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "types-first-passthrough:config" },
);

type Config = Infer<typeof ConfigSchema>;
type PassthroughInput = Input<Port<{ payload?: unknown }>>;
type PassthroughOutputs = Outputs<{ out: Port<unknown> }>;

class Passthrough extends IONode<
  Config,
  never,
  PassthroughInput,
  PassthroughOutputs
> {
  static override readonly type = "types-first-passthrough";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: PassthroughInput) {
    if ((msg as { fail?: boolean }).fail) throw new Error("nope");
    this.send("out", msg.payload);
  }
}

export default Passthrough;
