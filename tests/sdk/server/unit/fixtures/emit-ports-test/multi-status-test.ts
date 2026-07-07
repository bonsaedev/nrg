import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-ports-test:multi-status-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = { payload?: unknown };

class MultiStatusTest extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "multi-status-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.status({ fill: "green", shape: "dot", text: "step 1" });
    this.status({ fill: "green", shape: "dot", text: "step 2" });
    this.status({ fill: "green", shape: "dot", text: "step 3" });
  }
}

export default MultiStatusTest;
