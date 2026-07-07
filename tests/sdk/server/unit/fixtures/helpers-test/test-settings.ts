import { IONode, type Infer } from "@/sdk/lib/server";
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
type Input = { payload?: unknown };
type Output = { payload: number };

class TestSettingsNode extends IONode<
  any,
  Record<string, never>,
  Input,
  Output,
  Settings
> {
  static override readonly type = "test-settings";
  static override readonly category = "function";
  static override readonly settingsSchema: Schema = SettingsSchema;

  override async input(_msg: Input) {
    this.send({ payload: this.settings.timeout });
  }
}

export default TestSettingsNode;
