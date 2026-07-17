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
  { $id: "emit-ports-test:return-complete-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type ReturnCompleteInput = Input<Port<{ payload?: unknown }>>;
type ReturnCompleteOutputs = Outputs<{ out: Port<{ sum?: number }> }>;

class ReturnComplete extends IONode<
  Config,
  never,
  ReturnCompleteInput,
  ReturnCompleteOutputs
> {
  static override readonly type = "return-complete-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    return { sum: 42 };
  }
}

export default ReturnComplete;
