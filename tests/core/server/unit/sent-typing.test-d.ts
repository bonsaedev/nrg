import { createNode } from "@/test/server/unit";
import { defineIONode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/server/schemas";

// These nodes + functions are never executed. They exist so `tsc` (run via
// `pnpm validate:tsc`) verifies that `node.sent()` is typed positionally from
// the node's declared output — with no casts and no `any` in the assertions.

// --- single output ---------------------------------------------------------
const SingleNode = defineIONode({
  type: "td-single",
  inputSchema: defineSchema({ in: SchemaType.String() }),
  outputsSchema: defineSchema({ id: SchemaType.String() }),
  async input() {
    this.send({ id: "x" });
  },
});

async function singleProof() {
  const { node } = await createNode(SingleNode);
  // sent()[emission][port].output is the declared output value
  const id: string = node.sent()[0][0].output.id;
  void id;
  // @ts-expect-error output.id is a string, not a number
  const bad: number = node.sent()[0][0].output.id;
  void bad;
}
void singleProof;

// --- tuple (positional) multi-output ---------------------------------------
const TupleNode = defineIONode({
  type: "td-tuple",
  // no `as const` — the `const` type parameter on defineIONode makes this
  // inline array infer as a tuple, so positional output typing stays precise.
  outputsSchema: [
    defineSchema({ a: SchemaType.String() }),
    defineSchema({ b: SchemaType.Number() }),
  ],
  async input() {
    this.send([{ a: "x" }, { b: 1 }]);
  },
});

async function tupleProof() {
  const { node } = await createNode(TupleNode);
  const a: string = node.sent()[0][0].output.a;
  const b: number = node.sent()[0][1].output.b;
  void a;
  void b;
  // @ts-expect-error port 1 holds { b: number }, it has no `a`
  const bad: string = node.sent()[0][1].output.a;
  void bad;
}
void tupleProof;

// --- named-port (record) multi-output --------------------------------------
const RecordNode = defineIONode({
  type: "td-record",
  outputsSchema: {
    success: defineSchema({ ok: SchemaType.String() }),
    failure: defineSchema({ err: SchemaType.Number() }),
  },
  async input() {
    this.sendToPort("success", { ok: "y" });
  },
});

async function recordProof() {
  const { node } = await createNode(RecordNode);
  // named access is precise (record key order is not type-recoverable, so this
  // is the precise per-port accessor)
  const ok: string = node.sent("success")[0].output.ok;
  const err: number = node.sent("failure")[0].output.err;
  void ok;
  void err;
  // Anti-`any` guard: if the record-port output ever widens to `any` (the
  // failure mode of a brand/resolver regression) the positive assertions above
  // still compile, so pin a type mismatch that only breaks when it's precise.
  // @ts-expect-error output.ok is a string, not a number
  const badOk: number = node.sent("success")[0].output.ok;
  void badOk;
  // @ts-expect-error "missing" is not a declared port
  node.sent("missing");
}
void recordProof;
