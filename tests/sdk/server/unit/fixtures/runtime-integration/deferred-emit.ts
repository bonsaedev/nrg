import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Emits only AFTER an awaited macrotask (20ms). A single event-loop tick can't
// see the emission — receive() must settle on the node's done(). One input and
// one output port come from the generics.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "deferred-emit:config" },
);

type Config = Infer<typeof ConfigSchema>;
type DeferredInput = Input<Port<{ value?: unknown }>>;
type DeferredOutputs = Outputs<{ out: Port<{ echoed: unknown }> }>;

class Deferred extends IONode<
  Config,
  Record<string, never>,
  DeferredInput,
  DeferredOutputs
> {
  static override readonly type = "deferred-emit";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: DeferredInput) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.send("out", { echoed: msg.value });
  }
}

export default Deferred;
