import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A parent node that forwards its input straight to a downstream node. Node-RED
// delivers that send synchronously, so the child's `input` handler runs while
// THIS node's invocation scope is still on the stack — the exact condition that
// used to leak the ambient invocation store into the child's post-`await`
// lifecycle auto-emit (see lifecycle-emit.integration.test.ts).
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "sync-forwarder:config" },
);

type Config = Infer<typeof ConfigSchema>;
type ForwarderInput = Input<Port<{ payload?: unknown }>>;
type ForwarderOutputs = Outputs<{ next: Port<{ payload?: unknown }> }>;

class SyncForwarder extends IONode<
  Config,
  never,
  ForwarderInput,
  ForwarderOutputs
> {
  static override readonly type = "sync-forwarder";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: ForwarderInput) {
    this.send("next", { payload: msg.payload });
  }
}

export default SyncForwarder;
