import { IONode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A types-only node: its one input port and one base output port come from the
// generics (there is no inputSchema/outputsSchema anymore). The built-in
// error/complete/status ports are toggled by config flags.
const ConfigSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    completePort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "emit-ports-test:emit-test:config" },
);

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = { payload?: unknown };

// A custom Error subclass carrying extra data, as a node author would build.
class CustomError extends Error {
  code: string;
  retryable: boolean;
  detail: { attempt: number };
  // An unset optional field — an own enumerable property whose value is
  // `undefined`. The error port strips these (they carry no information).
  hint: string | undefined;
  constructor(message: string) {
    super(message);
    this.name = "CustomError";
    this.code = "E_CUSTOM";
    this.retryable = true;
    this.detail = { attempt: 2 };
    this.hint = undefined;
  }
}

class EmitTest extends IONode<Config, Record<string, never>, Input, Output> {
  static override readonly type = "emit-test";
  static override readonly configSchema = ConfigSchema;

  override async input(msg: Input) {
    const payload = msg.payload;
    if (payload === "error") {
      throw new Error("Test error");
    }
    if (payload === "custom-error") {
      throw new CustomError("Custom failure");
    }
    if (payload === "throw-primitive") {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "boom";
    }
    if (payload === "explicit-error") {
      this.error("Explicit error", msg);
      return;
    }
    if (payload === "error-then-throw") {
      // A node that logs/routes the error via error(msg) AND then throws must
      // still produce exactly ONE error-port message (not two).
      this.error("Logged then threw", msg);
      throw new Error("Logged then threw");
    }
    if (payload === "status") {
      this.status({ fill: "green", shape: "dot", text: "ok" });
      return;
    }
    this.send(msg);
  }
}

export default EmitTest;
