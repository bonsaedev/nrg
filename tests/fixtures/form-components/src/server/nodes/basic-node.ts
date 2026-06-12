import {
  IONode,
  type Schema,
  type Infer,
  SchemaType,
} from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/basic-node";

type Config = Infer<typeof ConfigsSchema>;

export default class BasicNode extends IONode<Config> {
  static override readonly type = "basic-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#c0deed";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly inputSchema: Schema = SchemaType.Object({});
  static override readonly outputsSchema: Schema = SchemaType.Object({});

  async input(msg: any) {
    this.send(msg);
  }
}
