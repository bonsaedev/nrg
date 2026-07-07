import { IONode, type Infer, type Port } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node with TWO custom named ports (a `Port<T>` record in the
// `Output` generic — no outputsSchema). Proves the harness stamps a two-port
// topology (baseOutputs === 2) and the named-port keys so an unknown-name
// `sendToPort` fails loudly. Its input does nothing; tests drive `sendToPort`
// directly.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-two-ports:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = {
  success: Port<{ payload: string }>;
  failure: Port<{ payload: { reason: string } }>;
};

class NamedTwoPorts extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "named-two-ports";
  static override readonly configSchema = ConfigSchema;

  override async input() {}
}

export default NamedTwoPorts;
