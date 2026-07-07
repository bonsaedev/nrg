import { defineIONode, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/output-schema-node";

type Config = Infer<typeof ConfigsSchema>;

// Two positional output ports (from the Output tuple generic) + an
// `outputSchemas` config declaration → the editor renders a Schema column whose
// button opens a Monaco (JSON) tray to set a port's data-validation schema.
// Exercises the per-port output schema editor e2e.
type Input = Record<string, unknown>;
type Output = [unknown, unknown];

export default defineIONode<Config, any, Input, Output>({
  type: "output-schema-node",
  configSchema: ConfigsSchema,
  async input(msg) {
    this.send([msg, null]);
  },
});
