import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Two positional ports; on input it emits a positional array whose FIRST slot
// is null and second carries a value. Proves per-port output validation skips
// the null slot and validates only the populated one.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-array-null:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = [
  { payload: string } | null,
  { payload: { reason: string } } | null,
];

class NamedEmitArrayNull extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "named-emit-array-null";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send([null, { payload: { reason: "test" } }]);
  }
}

export default NamedEmitArrayNull;
