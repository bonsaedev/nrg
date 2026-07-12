import type {
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
  MessageSource,
  NodeSource,
  OutputPortNames,
  Port,
} from "@/sdk/lib/server/nodes/types/ports";
import type { IONode, Input, Outputs } from "@/sdk/lib/server";

// Type-level proof that the built-in port message shapes match the runtime
// (`#wrapOutgoing` / the input-handler emit sites in io-node.ts). Compiled by
// `tsc -p tests/tsconfig.json`, never executed. Every port keeps `source` and
// `input` at the ROOT, side by side with the port's payload block — no `source`
// nested inside `error`/`complete`.

type In = { payload: string };

// --- Reserved built-in port names ("error"/"complete"/"status") are NOT
//     addressable data-port names. A data port that shares one of those names must
//     not be `send()`-targetable at the type level (the runtime throws on it), so
//     OutputPortNames excludes them.
type ReservedPortNames = OutputPortNames<{
  error: Port<{ code: number }>;
  ok: Port<{ value: string }>;
}>;
const addressableOk: ReservedPortNames = "ok";
void addressableOk;
// @ts-expect-error — "error" is a reserved built-in port name; `send("error", …)`
// throws at runtime, so it is excluded from the addressable output names.
const notAddressableError: ReservedPortNames = "error";
void notAddressableError;

// --- An index-signature output record (`Record<string, Port<T>>`, keyof `string`)
//     has NO statically-addressable names (the build injects no ports for it), so
//     OutputPortNames resolves to `never` — `send()` can't target an arbitrary name.
type IndexSigNames = OutputPortNames<Record<string, Port<{ v: number }>>>;
type IndexSigIsNever = [IndexSigNames] extends [never] ? true : false;
const indexSigNever: IndexSigIsNever = true;
void indexSigNever;

// --- A numeric index into a NAMED record types the message as the SOUND union of
//     every port's value (record key order isn't recoverable), not `unknown`.
declare const named: IONode<
  unknown,
  unknown,
  Input<Port<{ p: string }>>,
  Outputs<{ ok: Port<{ a: number }>; err: Port<{ b: string }> }>
>;
named.send(0, { a: 1 }); // a port's value — in the union
named.send(0, { b: "x" }); // the other port's value
// @ts-expect-error — a numeric send must carry a value in the port union, not garbage
named.send(0, { garbage: true });

// --- sent(index) on a DYNAMIC-ARRAY output recovers the element value precisely
//     (was `unknown` before), so the by-index accessor matches sent()'s precision.
declare const dyn: IONode<
  unknown,
  unknown,
  Input<Port<{ p: string }>>,
  Outputs<Port<{ v: number }>[]>
>;
const dynV: number = dyn.sent(0)[0].output.v;
void dynV;
// @ts-expect-error — output.v is a number, not a string (precise, not `unknown`/`any`)
const dynBad: string = dyn.sent(0)[0].output.v;
void dynBad;

// --- ERROR port: `error` block at root, `source` + `input` beside it ----------
function errorProof(m: ErrorPortOutput<In, { code: string }>) {
  const name: string = m.error.name;
  const message: string = m.error.message;
  const stack: string | undefined = m.error.stack; // carried explicitly
  const code: string = m.error.code; // author's own field rides `error`
  const source: NodeSource = m.source; // source is at the ROOT
  const input: In = m.input; // failing message at the ROOT
  // @ts-expect-error — `_msgid` rides the message at runtime but is deliberately
  // NOT typed (framework-internal lineage/lane key, hidden from authors)
  m._msgid;
  // @ts-expect-error — source is NOT nested inside the `error` block
  m.error.source;
  return { name, message, stack, code, source, input };
}

// --- COMPLETE port (with a return value): value under `complete` --------------
function completeReturnProof(m: CompletePortOutput<In, { ok: boolean }>) {
  const value: { ok: boolean } = m.complete; // return value under `complete`
  const source: NodeSource = m.source;
  const input: In = m.input;
  // @ts-expect-error — `_msgid` is deliberately not typed (hidden from authors)
  m._msgid;
  return { value, source, input };
}

// --- COMPLETE port (void return): source + input only, no `complete` key ------
function completeVoidProof(m: CompletePortOutput<In, void>) {
  const source: NodeSource = m.source;
  const input: In = m.input;
  // @ts-expect-error — a void return carries no `complete` value
  m.complete;
  return { source, input };
}

// --- STATUS port: status + source (no input — a notification) -----------------
function statusRootProof(m: StatusPortOutput) {
  const source: NodeSource = m.source; // source at the root
  // @ts-expect-error — `_msgid` is deliberately not typed (hidden from authors)
  m._msgid;
  return { status: m.status, source };
}

// --- MessageSource (data-port `msg.source`): node identity + port -------------
function messageSourceProof(s: MessageSource) {
  const id: string = s.id;
  const type: string = s.type;
  const name: string | undefined = s.name;
  const port: number = s.port; // which port produced the message
  const portName: string | undefined = s.portName; // named-port name, if any
  return { id, type, name, port, portName };
}

export {
  errorProof,
  completeReturnProof,
  completeVoidProof,
  statusRootProof,
  messageSourceProof,
};
