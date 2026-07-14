import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { type Schema } from "@bonsae/nrg/schema";
import { ConfigsSchema } from "@/schemas/greeting";

type Config = Infer<typeof ConfigsSchema>;
type GreetingInput = Input<Port<{ name: string }>>;
type GreetingOutputs = Outputs<{ greeting: Port<{ text: string }> }>;

export default class Greeting extends IONode<
  Config,
  never,
  GreetingInput,
  GreetingOutputs
> {
  static override readonly type = "greeting";
  static override readonly category = "function";
  static override readonly color: `#${string}` = "#c0deed";
  static override readonly configSchema: Schema = ConfigsSchema;

  override async input(msg: GreetingInput) {
    const { greeting, style, repeat } = this.config;
    const suffix =
      style === "excited" ? "!" : style === "friendly" ? " :)" : "";
    const text = Array.from(
      { length: repeat },
      () => `${greeting}, ${msg.name}${suffix}`,
    ).join(" ");
    this.send("greeting", { text });
  }
}
