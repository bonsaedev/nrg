import { ConfigNode, type Schema } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/config-server";

export default class ConfigServer extends ConfigNode {
  static override readonly type = "config-server";
  static override readonly configSchema: Schema = ConfigsSchema;

  async created() {}
  async closed() {}
}
