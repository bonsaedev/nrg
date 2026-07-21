import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-ports-test:send-error-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type SendErrorTestInput = Input<Port<{ payload?: unknown }>>;
type SendErrorTestOutputs = Outputs<{ out: Port<{ payload?: unknown }> }>;

class SendErrorTest extends IONode<
  Config,
  never,
  SendErrorTestInput,
  SendErrorTestOutputs
> {
  static override readonly type = "send-error-test";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: SendErrorTestInput) {
    // Explicitly put a failure on the error port — the SOURCE-node path
    // (`send("error")`, not a throw). Build the error INSIDE the node so
    // `instanceof Error` holds: the harness clones an incoming msg, which would
    // strip an Error to a bare object (its name/message/stack are non-enumerable).
    // `payload: "plain-object"` drives the plain-`{ message, … }` branch instead.
    const error =
      (msg as { payload?: unknown }).payload === "plain-object"
        ? { message: "nope", code: "E_NOPE" }
        : new Error("boom");
    this.send("error", { error });
  }
}

export default SendErrorTest;
