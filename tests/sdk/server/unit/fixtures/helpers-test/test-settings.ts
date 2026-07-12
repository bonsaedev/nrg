import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";

// A types-first node that reads an exportable runtime setting and emits it. The
// settings schema (5th generic) drives `this.settings`; the input/output ports
// come from the `Input`/`Output` generics.
const SettingsSchema = defineSchema(
  {
    timeout: SchemaType.Number({ default: 5000, exportable: true }),
  },
  { $id: "test-helpers:settings" },
);

type Settings = Infer<typeof SettingsSchema>;
type TestSettingsNodeInput = Input<Port<{ payload?: unknown }>>;
type TestSettingsNodeOutputs = Outputs<{ out: Port<{ payload: number }> }>;

class TestSettingsNode extends IONode<
  any,
  Record<string, never>,
  TestSettingsNodeInput,
  TestSettingsNodeOutputs,
  Settings
> {
  static override readonly type = "test-settings";
  static override readonly category = "function";
  static override readonly settingsSchema: Schema = SettingsSchema;

  override async input(_msg: TestSettingsNodeInput) {
    this.send("out", { payload: this.settings.timeout });
  }
}

export default TestSettingsNode;
