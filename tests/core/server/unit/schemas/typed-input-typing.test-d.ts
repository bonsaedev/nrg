import { defineSchema, SchemaType } from "@/core/shared/schemas";
import type { Infer as ServerInfer } from "@/core/server/schemas/types";
import type { Infer as ClientInfer } from "@/core/client/types";
import type { StatusPortOutput } from "@/core/server/schemas/types";
import type TypedInput from "@/core/server/typed-input";

// Never executed — `tsc` proves the per-plane brand wiring for TypedInput stays
// correct, and (statusProof) that the StatusPort message shape keeps the `"ring"`
// literal (guarding the `"string"` typo that this audit fixed in base.ts).

const ConfigSchema = defineSchema(
  { target: SchemaType.TypedInput<string>() },
  { $id: "typed-input-probe:configs" },
);

// --- server plane: TypedInput<string> resolving wrapper --------------------
function serverProof(c: ServerInfer<typeof ConfigSchema>) {
  const t: TypedInput<string> = c.target;
  void t;
  const resolved: Promise<string> = c.target.resolve();
  void resolved;
  // @ts-expect-error server TypedInput.value is unknown, not string
  const bad: string = c.target.value;
  void bad;
}
void serverProof;

// --- client plane: the raw { value, type } editor pair (no resolve) --------
function clientProof(c: ClientInfer<typeof ConfigSchema>) {
  const v: string = c.target.value;
  const ty: string = c.target.type;
  void v;
  void ty;
  // @ts-expect-error the client value is the raw pair, not the resolving wrapper
  void c.target.resolve;
}
void clientProof;

// --- StatusPortOutput shape must keep "ring" (and reject the old "string") --
function statusProof(m: StatusPortOutput) {
  if (typeof m.status !== "string") {
    const shape: "ring" | "dot" | undefined = m.status.shape;
    void shape;
    const fill:
      | "red"
      | "green"
      | "yellow"
      | "blue"
      | "grey"
      | "gray"
      | undefined = m.status.fill;
    void fill;
    // @ts-expect-error "string" was the typo and must not be a valid shape
    const bad: "string" = m.status.shape;
    void bad;
  }
}
void statusProof;
