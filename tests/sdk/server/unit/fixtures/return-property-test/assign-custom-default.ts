import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Types-first fixture proving a node-author DEFAULT return property per port. The
// config schema seeds `outputReturnProperties` to `{ 0: "data" }`, so port 0 uses
// `data` instead of the built-in `output` key unless the flow author overrides it.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    outputReturnProperties: SchemaType.OutputReturnProperties({
      default: { 0: "data" },
    }),
  },
  { $id: "assign-custom-default:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = unknown;

class AssignCustomDefault extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-custom-default";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("ok");
  }
}

export default AssignCustomDefault;
