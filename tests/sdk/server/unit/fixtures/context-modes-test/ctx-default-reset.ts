import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A node AUTHOR seeds a port's default context mode by declaring
// `outputContextModes` in the configSchema with a default — here port 0 defaults
// to `reset`, so the node emits a FRESH record unless the flow author overrides
// the mode in the editor. Declaring the built-in only changes its default; the
// control renders on every IONode regardless.
const ConfigSchema = defineSchema(
  {
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "reset" },
    }),
  },
  { $id: "context-modes-test:ctx-default-reset:config" },
);

type Config = Infer<typeof ConfigSchema>;
type CtxDefaultResetInput = Input<Port<{ topic?: string }>>;
type CtxDefaultResetOutputs = Outputs<{ out: Port<{ result: string }> }>;

class CtxDefaultReset extends IONode<
  Config,
  never,
  CtxDefaultResetInput,
  CtxDefaultResetOutputs
> {
  static override readonly type = "ctx-default-reset";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send("out", { result: "fresh" });
  }
}

export default CtxDefaultReset;
