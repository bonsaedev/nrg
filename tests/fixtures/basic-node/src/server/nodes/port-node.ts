import { IONode, type Infer, type Port } from "@bonsae/nrg/server";
import { type Schema, SchemaType, defineSchema } from "@bonsae/nrg/schema";

// Schema-free PORT topology: NO inputSchema / outputsSchema — the input port and
// the two named output ports ("ok"/"err") come ENTIRELY from the generics, so
// the build stamps `__nrgPorts` and the runtime + editor draw them from the
// types. Exercises the port-topology injector end to end.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "port-node:configs" },
);
type Config = Infer<typeof ConfigSchema>;
type Input = { payload: string };
type Output = {
  ok: Port<{ value: number }>;
  err: Port<{ reason: string }>;
};

export default class PortNode extends IONode<Config, never, Input, Output> {
  static override readonly type = "port-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = ConfigSchema;

  async input(msg: Input) {
    this.sendToPort("ok", { value: msg.payload.length });
  }
}
