import {
  IONode,
  type Schema,
  type Infer,
  SchemaType,
} from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/custom-form-node";

type Config = Infer<typeof ConfigsSchema>;

export default class CustomFormNode extends IONode<Config> {
  static override readonly type = "custom-form-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#d8bfd8";
  static override readonly configSchema: Schema = ConfigsSchema;
  static override readonly inputSchema: Schema = SchemaType.Object({});
  static override readonly outputsSchema: Schema = SchemaType.Object({});

  async input(msg: any) {
    this.send(msg);
  }
}
