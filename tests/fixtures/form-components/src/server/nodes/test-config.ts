import { ConfigNode, type Schema } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/test-config";

export default class TestConfig extends ConfigNode {
  static override readonly type = "test-config";
  static override readonly configSchema: Schema = ConfigsSchema;

  async created() {}
  async closed() {}
}
