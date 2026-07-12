import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/example";

type Config = Infer<typeof ConfigsSchema>;
type ExampleInput = Input<Port<{ value: number }>>;
type ExampleOutput = Outputs<{ out: Port<{ value: number }> }>;

export default class ExampleNode extends IONode<
  Config,
  any,
  ExampleInput,
  ExampleOutput
> {
  static override readonly type = "example-node";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#a6bbcf";
  static override readonly configSchema: Schema = ConfigsSchema;

  override async input(msg: ExampleInput) {
    this.send("out", { value: msg.value });
  }
}
