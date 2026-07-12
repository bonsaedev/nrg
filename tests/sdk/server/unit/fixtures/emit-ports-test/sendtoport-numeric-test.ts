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
  { $id: "emit-ports-test:sendtoport-numeric-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type SendToPortNumericInput = Input<Port<{ payload?: unknown }>>;
type SendToPortNumericOutputs = Outputs<{ out: Port<unknown> }>;

class SendToPortNumeric extends IONode<
  Config,
  Record<string, never>,
  SendToPortNumericInput,
  SendToPortNumericOutputs
> {
  static override readonly type = "sendtoport-numeric-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send(0, "record");
  }
}

export default SendToPortNumeric;
