import { IONode, type Infer } from "@/sdk/lib/server";
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
type Input = { payload?: unknown };
type Output = { payload?: unknown };

class VoidComplete extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "void-complete-test";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    // no return
  }
}

export default VoidComplete;
