import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
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
type AssignCustomDefaultInput = Input<Port<{ payload?: unknown }>>;
type AssignCustomDefaultOutputs = Outputs<{ out: Port<unknown> }>;

class AssignCustomDefault extends IONode<
  Config,
  Record<string, never>,
  AssignCustomDefaultInput,
  AssignCustomDefaultOutputs
> {
  static override readonly type = "assign-custom-default";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("out", "ok");
  }
}

export default AssignCustomDefault;
