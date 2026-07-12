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
  { $id: "emit-ports-test:void-complete-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type VoidCompleteInput = Input<Port<{ payload?: unknown }>>;
type VoidCompleteOutputs = Outputs<{ out: Port<{ payload?: unknown }> }>;

class VoidComplete extends IONode<
  Config,
  Record<string, never>,
  VoidCompleteInput,
  VoidCompleteOutputs
> {
  static override readonly type = "void-complete-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    // no return
  }
}

export default VoidComplete;
