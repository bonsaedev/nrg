import { createNode } from "@/sdk/test/server/unit";
import { IONode } from "@/sdk/lib/server";
import type { InputMessage, MessageLanes } from "@/sdk/lib/server";

// Compile-time proofs for the message-lane types — never executed; `tsc` (via
// `pnpm validate:tsc`) verifies them. They pin the DX/type guarantees the runtime
// behavioral tests can't see: the lanes are present and precisely `unknown` (never
// `any`), they stay OFF the wire `Input` generic, `_msgid` is NOT on the parameter,
// and the harness `receive()` takes the wire message with the lanes stripped.

type Wire = { payload: string };
type Msg = InputMessage<Wire>;

declare const msg: Msg;

// (a) both lanes are visible and are string-keyed records
const prot: Record<string, unknown> = msg.protected;
const priv: Record<string, unknown> = msg.private;
void prot;
void priv;

// (b) a lane value is `unknown`, NOT `any`. An `any` would silently satisfy the
//     concrete-typed assignment below; `unknown` does not, so the @ts-expect-error
//     only holds when the value is genuinely `unknown`.
// @ts-expect-error - msg.private.res is `unknown`, not assignable to a concrete type
const concrete: { end(): void } = msg.private.res;
void concrete;
const asUnknown: unknown = msg.private.res;
void asUnknown;

// (c) the wire shape survives the intersection
const payload: string = msg.payload;
void payload;

// (d) the lanes are NOT keys of the wire `Input` generic (they live only on the
//     `input()` parameter) — so the port topology, derived from the generic, is
//     unaffected by them.
type LanesOnWire = "protected" | "private" extends keyof Wire ? true : false;
const noLanesOnWire: LanesOnWire = false;
void noLanesOnWire;

// (e) the harness `receive()` takes the WIRE message: `ExtractInput` strips the
//     lanes, so a plain wire message compiles with no protected/private. And the
//     emitted frame exposes the lanes, typed `unknown`.
class LaneProofNode extends IONode<
  Record<string, never>,
  unknown,
  Wire,
  { out: number }
> {
  static override readonly type = "ml-type-proof";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(_m: Msg) {}
}
declare const result: Awaited<
  ReturnType<typeof createNode<typeof LaneProofNode>>
>;
// no lanes required on the wire message:
void result.node.receive({ payload: "x", _msgid: "1" });
const emittedTrace: unknown = result.node.sent(0)[0].protected.trace;
void emittedTrace;

// (f) `_msgid` is NOT on the `input()` parameter type. It's the framework's
//     internal lane key, deliberately kept off `InputMessage` so a node author
//     never sees it in autocomplete and can't read or overwrite it through the
//     typed parameter (which would fork the message from its lanes). It still
//     exists at runtime — reaching it takes an explicit cast.
// @ts-expect-error - _msgid is intentionally absent from InputMessage
const noMsgid: unknown = msg._msgid;
void noMsgid;
