import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Two positional ports; on input it emits a positional array whose FIRST slot
// carries a value and second is null. Proves per-port output validation runs on
// the non-null slot (when enabled via config `validateOutputs`/`outputSchemas`)
// and the null slot is skipped. The slot types are nullable so a sparse emit is
// expressible without a cast.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-array:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NamedEmitArrayInput = Input<Port<{ payload?: unknown }>>;
type NamedEmitArrayOutputs = Outputs<{
  out0: Port<{ payload: string } | null>;
  out1: Port<{ payload: { reason: string } } | null>;
}>;

class NamedEmitArray extends IONode<
  Config,
  Record<string, never>,
  NamedEmitArrayInput,
  NamedEmitArrayOutputs
> {
  static override readonly type = "named-emit-array";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("out0", { payload: "valid" });
    this.send("out1", null);
  }
}

export default NamedEmitArray;
