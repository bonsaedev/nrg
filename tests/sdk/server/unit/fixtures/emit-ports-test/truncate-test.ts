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
  { $id: "emit-ports-test:truncate-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type TruncateTestInput = Input<Port<{ payload?: unknown }>>;
// Two named base output ports come from a tuple output (out0/out1) — built-in
// error/status ports are appended after them, so a send can only ever address a
// declared base port and never leak into a built-in port slot.
type TruncateTestOutputs = Outputs<{
  out0: Port<{ payload?: unknown }>;
  out1: Port<{ payload?: unknown }>;
}>;

class TruncateTest extends IONode<
  Config,
  Record<string, never>,
  TruncateTestInput,
  TruncateTestOutputs
> {
  static override readonly type = "truncate-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("out0", { payload: "port-0" });
    this.send("out1", { payload: "port-1" });
  }
}

export default TruncateTest;
