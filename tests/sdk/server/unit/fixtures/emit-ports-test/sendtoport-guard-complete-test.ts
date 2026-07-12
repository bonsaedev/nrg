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
  { $id: "emit-ports-test:sendtoport-guard-complete-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type SendToPortGuardCompleteInput = Input<Port<{ payload?: unknown }>>;
type SendToPortGuardCompleteOutputs = Outputs<{ out: Port<unknown> }>;

class SendToPortGuardComplete extends IONode<
  Config,
  Record<string, never>,
  SendToPortGuardCompleteInput,
  SendToPortGuardCompleteOutputs
> {
  static override readonly type = "sendtoport-guard-complete-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    (this as any).send("complete", { payload: "test" });
  }
}

export default SendToPortGuardComplete;
