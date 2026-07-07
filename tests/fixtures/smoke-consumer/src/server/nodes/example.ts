import { defineIONode, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/example";

type Config = Infer<typeof ConfigsSchema>;
type Input = { value: number };
type Output = { value: number };

export default defineIONode<Config, any, Input, Output>({
  type: "example-node",
  category: "function",
  color: "#a6bbcf",
  configSchema: ConfigsSchema,
  async input(msg) {
    this.send(msg);
  },
});
