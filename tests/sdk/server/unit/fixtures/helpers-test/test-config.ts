import { ConfigNode, type Infer } from "@/sdk/lib/server";
import {
  defineSchema,
  SchemaType,
  type Schema,
} from "@/sdk/lib/shared/schemas";

// A shared config node, referenced by `test-io` through a NodeRef. It carries no
// ports (ConfigNode), so topology injection is a no-op — it lives in the fixture
// tree only so `test-io` can import its type and the harness can construct it.
const TestConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "test-config" }),
    host: SchemaType.String({ default: "localhost" }),
    port: SchemaType.Number({ default: 8080 }),
  },
  { $id: "test-helpers:config" },
);

type TestConfig = Infer<typeof TestConfigSchema>;

class TestConfigNode extends ConfigNode<TestConfig> {
  static override readonly type = "test-config";
  static override readonly configSchema: Schema = TestConfigSchema;

  override async created() {
    this.log("config node created");
  }
}

export default TestConfigNode;
export { TestConfigSchema };
export type { TestConfig };
