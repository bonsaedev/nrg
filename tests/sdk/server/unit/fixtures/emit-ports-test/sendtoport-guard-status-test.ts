import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-ports-test:sendtoport-guard-status-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = unknown;

class SendToPortGuardStatus extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "sendtoport-guard-status-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    (this as any).sendToPort("status", { payload: "test" });
  }
}

export default SendToPortGuardStatus;
