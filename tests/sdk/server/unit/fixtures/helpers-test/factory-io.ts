import { defineIONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-first functional-API IO node. Ports come from the generics passed to
// `defineIONode<Config, Credentials, Input, Output>` (the extractor reads them off
// the call's return type), NOT from an inputSchema/outputsSchema.
const FactoryIOSchema = defineSchema(
  {
    name: SchemaType.String({ default: "factory-io" }),
    prefix: SchemaType.String({ default: ">" }),
  },
  { $id: "test-helpers:factory-io-config" },
);

type FactoryIOConfig = Infer<typeof FactoryIOSchema>;
type Input = { payload?: unknown };
type Output = { payload: string };

const FactoryIONode = defineIONode<FactoryIOConfig, any, Input, Output>({
  type: "factory-io",
  category: "function",
  configSchema: FactoryIOSchema,

  created() {
    this.log("factory io created");
  },

  input(msg) {
    this.send({ payload: `${this.config.prefix} ${msg.payload}` });
  },
});

export default FactoryIONode;
