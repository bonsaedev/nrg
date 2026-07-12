import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import type Greeting from "./greeting-config";

// A types-only IO node whose config carries a NodeRef to the `greeting-config`
// config node. Its input/output ports come from the generics; the NodeRef field
// resolves to the referenced config node instance at runtime.
const GreeterSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    source: SchemaType.NodeRef<Greeting>("greeting-config"),
  },
  { $id: "greeter:config" },
);

type Config = Infer<typeof GreeterSchema>;
type GreeterInput = Input<Port<{ who: string }>>;
type GreeterOutputs = Outputs<{ out: Port<{ text: string }> }>;

class Greeter extends IONode<
  Config,
  Record<string, never>,
  GreeterInput,
  GreeterOutputs
> {
  static override readonly type = "greeter";
  static override readonly configSchema = GreeterSchema;

  override async input(msg: GreeterInput) {
    const source = this.config.source;
    this.send("out", { text: `${source.greeting}, ${msg.who}` });
  }
}

export default Greeter;
