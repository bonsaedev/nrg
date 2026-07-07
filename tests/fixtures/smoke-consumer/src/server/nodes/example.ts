import { IONode, type Infer } from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/example";

type Config = Infer<typeof ConfigsSchema>;
type Input = { value: number };
type Output = { value: number };

export default class ExampleNode extends IONode<Config, any, Input, Output> {
  static override readonly type = "example-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = ConfigsSchema;

  override async input(msg: Input) {
    this.send(msg);
  }
}
