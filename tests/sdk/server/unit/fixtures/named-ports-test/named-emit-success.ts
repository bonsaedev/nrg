import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Two named ports; on input it routes to the "success" port by name. Used to
// prove `sendToPort("success", …)` resolves by name, both on its own and while
// a built-in port (errorPort) is enabled.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-success:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NamedEmitSuccessInput = Input<Port<{ payload?: unknown }>>;
type NamedEmitSuccessOutputs = Outputs<{
  success: Port<{ payload: string }>;
  failure: Port<{ payload: { reason: string } }>;
}>;

class NamedEmitSuccess extends IONode<
  Config,
  Record<string, never>,
  NamedEmitSuccessInput,
  NamedEmitSuccessOutputs
> {
  static override readonly type = "named-emit-success";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("success", { payload: "ok" });
  }
}

export default NamedEmitSuccess;
