import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A child node with a built-in complete port. It is delivered to synchronously
// by SyncForwarder (so the parent's invocation store is ambient when this node's
// handler starts), then RETURNS a record — which the framework auto-emits on the
// complete port AFTER `await input()`, i.e. outside the invocation scope. That
// emit must route through THIS node's own send, not the leaked parent's.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: true }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "completer:config" },
);

type Config = Infer<typeof ConfigSchema>;
type CompleterInput = Input<Port<{ payload?: unknown }>>;
type CompleterOutputs = Outputs<{ out: Port<{ echoed: unknown }> }>;

class Completer extends IONode<
  Config,
  never,
  CompleterInput,
  CompleterOutputs
> {
  static override readonly type = "completer";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: CompleterInput): Promise<{ handled: boolean }> {
    // A boom payload exercises the error auto-emit on the SAME leaked-scope path.
    if (msg.payload === "boom") throw new Error("kaboom");
    return { handled: true }; // → the built-in complete port
  }
}

export default Completer;
