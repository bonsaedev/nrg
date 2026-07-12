import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A TYPES-ONLY node: its one input port and one output port come from the
// generics, NOT from an inputSchema/outputsSchema (there are none). Used to prove
// the unit harness injects the build-time port topology so the built-in error
// port routes at the right index — exactly as a built node would.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "types-first-error-router:config" },
);

type Config = Infer<typeof ConfigSchema>;
type ErrorRouterInput = Input<Port<{ payload?: unknown }>>;
type ErrorRouterOutputs = Outputs<{ out: Port<{ value: number }> }>;

class ErrorRouter extends IONode<
  Config,
  Record<string, never>,
  ErrorRouterInput,
  ErrorRouterOutputs
> {
  static override readonly type = "types-first-error-router";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: ErrorRouterInput) {
    if (msg.payload === "boom") throw new Error("boom");
    this.send("out", { value: 1 });
  }
}

export default ErrorRouter;
