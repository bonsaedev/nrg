import { defineIONode, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/custom-node";

type Config = Infer<typeof ConfigsSchema>;
type Input = { payload: string };
type Output = { result: string; timestamp: number };

export default defineIONode<Config, any, Input, Output>({
  type: "custom-node",
  category: "function",
  color: "#33cc99",
  configSchema: ConfigsSchema,

  async input(msg) {
    this.send({ result: msg.payload, timestamp: Date.now() });
  },
});
