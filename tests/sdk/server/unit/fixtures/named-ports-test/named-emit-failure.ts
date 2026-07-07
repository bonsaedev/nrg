import { IONode, type Infer, type Port } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// Two named ports; on input it routes to the SECOND named port ("failure").
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "named-ports-test:named-emit-failure:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = {
  success: Port<{ payload: string }>;
  failure: Port<{ payload: { reason: string } }>;
};

class NamedEmitFailure extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "named-emit-failure";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    this.sendToPort("failure", { payload: { reason: "bad" } });
  }
}

export default NamedEmitFailure;
