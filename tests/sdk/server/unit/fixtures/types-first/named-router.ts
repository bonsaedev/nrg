import { IONode, type Infer, type Port } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node with CUSTOM NAMED ports declared purely through the generics
// (a `Port<T>` record, no outputsSchema). Proves the harness stamps outputNames
// so `sendToPort("ok"/"err")` and `sent("ok"/"err")` resolve by name.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "types-first-named-router:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = {
  ok: Port<{ value: number }>;
  err: Port<{ reason: string }>;
};

class NamedRouter extends IONode<Config, Record<string, never>, Input, Output> {
  static override readonly type = "types-first-named-router";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: Input) {
    if ((msg as { bad?: boolean }).bad) {
      this.sendToPort("err", { reason: "bad" });
    } else {
      this.sendToPort("ok", { value: 1 });
    }
  }
}

export default NamedRouter;
