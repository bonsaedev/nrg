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
  { $id: "emit-ports-test:sendtoport-guard-error-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type SendToPortGuardErrorInput = Input<Port<{ payload?: unknown }>>;
type SendToPortGuardErrorOutputs = Outputs<{ out: Port<unknown> }>;

class SendToPortGuardError extends IONode<
  Config,
  Record<string, never>,
  SendToPortGuardErrorInput,
  SendToPortGuardErrorOutputs
> {
  static override readonly type = "sendtoport-guard-error-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    (this as any).send("error", { payload: "test" });
  }
}

export default SendToPortGuardError;
