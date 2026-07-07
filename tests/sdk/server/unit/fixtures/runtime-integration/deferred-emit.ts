import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Emits only AFTER an awaited macrotask (20ms). A single event-loop tick can't
// see the emission — receive() must settle on the node's done(). One input and
// one output port come from the generics.
const ConfigSchema = defineSchema(
  { name: SchemaType.String({ default: "" }) },
  { $id: "deferred-emit:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { value?: unknown };
type Output = { echoed: unknown };

class Deferred extends IONode<Config, Record<string, never>, Input, Output> {
  static override readonly type = "deferred-emit";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: Input) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.send({ echoed: msg.value });
  }
}

export default Deferred;
