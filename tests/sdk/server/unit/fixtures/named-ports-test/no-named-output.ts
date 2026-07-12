import {
  IONode,
  type Infer,
  type Input,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node with NO output ports (Output = never), so its topology
// carries zero base outputs and no named-port names. Under named-always there is
// no "single unnamed port" form anymore: a record output is always named, so the
// only node with no named ports is one with `never` (or a dynamic index-addressed
// array) output. Proves `send("name")` fails loudly ("no named output ports") on
// a node whose topology declares no named ports.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:no-named-output:config" },
);

type Config = Infer<typeof ConfigSchema>;
type NoNamedOutputInput = Input<Port<{ payload?: unknown }>>;
type Output = never;

class NoNamedOutput extends IONode<
  Config,
  Record<string, never>,
  NoNamedOutputInput,
  Output
> {
  static override readonly type = "no-named-output";
  static override readonly configSchema = ConfigSchema;

  override async input() {}
}

export default NoNamedOutput;
