import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Relays a fixed marker on every input. Its single input port (from the `Input`
// generic) is what lets an upstream node's wire deliver here.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "relay:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = { relayed: boolean };

class Relay extends IONode<Config, Record<string, never>, Input, Output> {
  static override readonly type = "relay";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.send({ relayed: true });
  }
}

export default Relay;
