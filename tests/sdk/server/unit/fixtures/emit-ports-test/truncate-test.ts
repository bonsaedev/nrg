import { IONode, type Infer } from "@/sdk/lib/server";
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
type Input = { payload?: unknown };
// Two positional base output ports come from a tuple output — built-in
// error/status ports are appended after them, so an over-length send() must
// truncate to baseOutputs (2) rather than leak into a built-in port slot.
type Output = [{ payload?: unknown }, { payload?: unknown }];

class TruncateTest extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "truncate-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    (this as any).send([
      { payload: "port-0" },
      { payload: "port-1" },
      { payload: "should-be-dropped" },
      { payload: "also-dropped" },
    ]);
  }
}

export default TruncateTest;
