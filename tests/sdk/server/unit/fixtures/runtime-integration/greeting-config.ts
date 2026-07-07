import { ConfigNode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A shared config node referenced by `greeter` through a NodeRef. It carries no
// ports (ConfigNode), so topology injection is a no-op — it lives in the fixture
// tree so `greeter` can import its type and the harness can construct it.
const GreetingSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    greeting: SchemaType.String({ default: "hi" }),
  },
  { $id: "greeting-config:config" },
);

type GreetingConfig = Infer<typeof GreetingSchema>;

class Greeting extends ConfigNode<GreetingConfig> {
  static override readonly type = "greeting-config";
  static override readonly configSchema = GreetingSchema;

  get greeting(): string {
    return this.config.greeting;
  }
}

export default Greeting;
