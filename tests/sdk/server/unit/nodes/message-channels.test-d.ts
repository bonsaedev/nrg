import { createNode } from "@/sdk/test/server/unit";
import { IONode, Channels } from "@/sdk/lib/server";
import type { Input, Outputs, Port } from "@/sdk/lib/server";

// Compile-time proofs for the message-channel types — never executed; `tsc` (via
// `pnpm validate:tsc`) verifies them. They pin the DX/type guarantees the runtime
// behavioral tests can't see: the channels are present and precisely `unknown` (never
// `any`), they stay OFF the wire `Input` generic, `_msgid` is NOT on the parameter,
// and the harness `receive()` takes the wire message with the channels stripped.

type Wire = { payload: string };
type Msg = Input<Port<Wire>>;

declare const msg: Msg;

// (a) both channels are visible and are string-keyed records
const prot: Record<string, unknown> = msg[Channels].protected;
const priv: Record<string, unknown> = msg[Channels].private;
void prot;
void priv;

// (b) a channel value is `unknown`, NOT `any`. An `any` would silently satisfy the
//     concrete-typed assignment below; `unknown` does not, so the @ts-expect-error
//     only holds when the value is genuinely `unknown`.
// @ts-expect-error - msg[Channels].private.res is `unknown`, not assignable to a concrete type
const concrete: { end(): void } = msg[Channels].private.res;
void concrete;
const asUnknown: unknown = msg[Channels].private.res;
void asUnknown;

// (c) the wire shape survives the intersection
const payload: string = msg.payload;
void payload;

// (d) the channels are NOT keys of the wire `Input` generic (they live only on the
//     `input()` parameter) — so the port topology, derived from the generic, is
//     unaffected by them.
type ChannelsOnWire = "protected" | "private" extends keyof Wire ? true : false;
const noChannelsOnWire: ChannelsOnWire = false;
void noChannelsOnWire;

// (e) the harness `receive()` takes the WIRE message: `ExtractInput` strips the
//     channels, so a plain wire message compiles with no protected/private. And the
//     emitted frame exposes the channels, typed `unknown`.
class ChannelProofNode extends IONode<
  never,
  unknown,
  Input<Port<Wire>>,
  Outputs<{ out: Port<{ out: number }> }>
> {
  static override readonly type = "ml-type-proof";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(_m: Msg) {}
}
declare const result: Awaited<
  ReturnType<typeof createNode<typeof ChannelProofNode>>
>;
// no channels required on the wire message:
void result.node.receive({ payload: "x", _msgid: "1" });
// the emitted frame exposes the channels, typed `unknown` (never `any`): the
// concrete assignment errors, mirroring (b) — an `any` regression would silently
// satisfy it and fail this proof (unused @ts-expect-error).
// @ts-expect-error - the emitted frame's protected.trace is `unknown`
const emittedConcrete: { end(): void } =
  result.node.sent(0)[0][Channels].protected.trace;
void emittedConcrete;
const emittedTrace: unknown = result.node.sent(0)[0][Channels].protected.trace;
void emittedTrace;

// (f) `_msgid` is NOT on the `input()` parameter type. It's the framework's
//     internal channel key, deliberately kept off the `Input<Port<…>>` message so a
//     node author never sees it in autocomplete and can't read or overwrite it
//     through the typed parameter (which would fork the message from its channels).
//     It still exists at runtime — reaching it takes an explicit cast.
// @ts-expect-error - _msgid is intentionally absent from the input message
const noMsgid: unknown = msg._msgid;
void noMsgid;

// ── typed channels: a shape declared on the PORT (`Port<Wire, ChannelShape>`) ──────
// (g) READ: a declared partition key is PRECISE (not `unknown`), while undeclared keys
//     on the same partition stay `unknown` — the open bag is preserved.
type Conn = { end(): void };
type TypedMsg = Input<Port<Wire, { private: { conn?: Conn } }>>;
declare const tmsg: TypedMsg;
const typedConn: Conn | undefined = tmsg[Channels].private.conn; // precise, no cast
void typedConn;
// @ts-expect-error - conn is `Conn | undefined`, NOT a string (proves it isn't `any`)
const connMistyped: string = tmsg[Channels].private.conn;
void connMistyped;
const stillUnknown: unknown = tmsg[Channels].private.other; // undeclared key → unknown
void stillUnknown;

// (h) SEND: an OUTPUT port that declares a shape TYPES the `send()` channel argument,
//     so the write contract is enforced (and autocompleted). Symmetric with the read.
declare const conn: Conn;
class TypedSendNode extends IONode<
  never,
  unknown,
  Input<Port<Wire>>,
  Outputs<{ out: Port<{ x: number }, { private: { conn: Conn } }> }>
> {
  static override readonly type = "ml-typed-send-proof";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(_m: Msg) {
    this.send("out", { x: 1 }, { private: { conn } }); // the declared channel is accepted
    this.send("out", { x: 1 }); // channels stay OPTIONAL
    // @ts-expect-error - the channel value must be a Conn, not a number
    this.send("out", { x: 1 }, { private: { conn: 123 } });
    // @ts-expect-error - the required `conn` channel is missing from the private partition
    this.send("out", { x: 1 }, { private: {} });
  }
}
void TypedSendNode;

// (i) HARNESS: the typed channels flow through the test harness too — `sent()[i][Channels]`
//     is typed from the OUTPUT port's shape, and `receive()`'s channels arg from the INPUT
//     port's shape. So a test reads/seeds channels with no cast.
class TypedHarnessNode extends IONode<
  never,
  unknown,
  Input<Port<Wire, { private: { token?: string } }>>,
  Outputs<{ out: Port<{ out: number }, { private: { conn: Conn } }> }>
> {
  static override readonly type = "ml-typed-harness-proof";
  static override readonly category = "test";
  static override readonly color = "#ffffff";
  override async input(
    _m: Input<Port<Wire, { private: { token?: string } }>>,
  ) {}
}
declare const th: Awaited<
  ReturnType<typeof createNode<typeof TypedHarnessNode>>
>;
// `sent()[i][Channels]` typed from the output port's declared shape — no cast:
const emittedConn: Conn = th.node.sent("out")[0][Channels].private.conn;
void emittedConn;
// @ts-expect-error - the emitted conn is a Conn, not a string (proves it isn't `any`)
const emittedConnBad: string = th.node.sent("out")[0][Channels].private.conn;
void emittedConnBad;
// `receive()`'s channels arg typed from the input port's declared shape:
void th.node.receive(
  { payload: "x", _msgid: "1" },
  { private: { token: "t" } },
);
// @ts-expect-error - the seeded `token` must be a string
void th.node.receive({ payload: "x", _msgid: "1" }, { private: { token: 42 } });
