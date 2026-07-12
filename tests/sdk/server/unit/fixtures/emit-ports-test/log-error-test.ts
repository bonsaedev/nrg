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
  { $id: "emit-ports-test:log-error-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type LogErrorTestInput = Input<Port<{ payload?: unknown }>>;
type LogErrorTestOutputs = Outputs<{ out: Port<{ payload?: unknown }> }>;

class LogErrorTest extends IONode<
  Config,
  Record<string, never>,
  LogErrorTestInput,
  LogErrorTestOutputs
> {
  static override readonly type = "log-error-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    // error() without msg — should not send to error port
    this.error("Log only error");
  }
}

export default LogErrorTest;
