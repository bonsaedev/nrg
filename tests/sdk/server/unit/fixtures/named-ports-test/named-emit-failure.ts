import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Two named ports; on input it routes to the SECOND named port ("failure").
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-failure:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NamedEmitFailureInput = Input<Port<{ payload?: unknown }>>;
type NamedEmitFailureOutputs = Outputs<{
  success: Port<{ payload: string }>;
  failure: Port<{ payload: { reason: string } }>;
}>;

class NamedEmitFailure extends IONode<
  Config,
  Record<string, never>,
  NamedEmitFailureInput,
  NamedEmitFailureOutputs
> {
  static override readonly type = "named-emit-failure";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("failure", { payload: { reason: "bad" } });
  }
}

export default NamedEmitFailure;
