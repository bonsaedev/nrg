import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-ports-test:sendtoport-status-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type SendToPortStatusInput = Input<Port<{ payload?: unknown }>>;
type SendToPortStatusOutputs = Outputs<{ out: Port<{ payload?: unknown }> }>;

class SendToPortStatus extends IONode<
  Config,
  never,
  SendToPortStatusInput,
  SendToPortStatusOutputs
> {
  static override readonly type = "sendtoport-status-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.status({ fill: "green", shape: "dot", text: "working" });
  }
}

export default SendToPortStatus;
