import type {
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
  MessageSource,
  OutputPortNames,
  Port,
} from "@/sdk/lib/server/nodes/types/ports";
import type { IONode, Input, Outputs } from "@/sdk/lib/server";

// Type-level proof that the built-in port message shapes match the runtime
// (`#wrapOutgoing` / `#emitLifecycle` in io-node.ts). Compiled by
// `tsc -p tests/tsconfig.json`, never executed. Every lifecycle frame follows
// the MERGE rule: the processed record's fields (typed optional) plus the
// port's additions (`error` block / the returned fields / `status`). Provenance
// rides `msg[Meta]` at runtime — never a typed root key.

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
const dynV: number = dyn.sent(0)[0].v;
void dynV;
// @ts-expect-error — v is a number, not a string (precise, not `unknown`/`any`)
const dynBad: string = dyn.sent(0)[0].v;
void dynBad;

// --- ERROR port: the failing record's fields (optional) plus the `error` block
function errorProof(m: ErrorPortOutput<In, { code: string }>) {
  const name: string = m.error.name;
  const message: string = m.error.message;
  const stack: string | undefined = m.error.stack; // carried explicitly
  const code: string = m.error.code; // author's own field rides `error`
  const payload: string | undefined = m.payload; // the record that failed, carried
  // @ts-expect-error — `_msgid` rides the message at runtime but is deliberately
  // NOT typed (framework-internal lineage/channel key, hidden from authors)
  m._msgid;
  // @ts-expect-error — provenance rides msg[Meta] at runtime, never a typed root key
  m.source;
  return { name, message, stack, code, payload };
}

// --- COMPLETE port (with a return value): the returned FIELDS ride the frame --
function completeReturnProof(m: CompletePortOutput<In, { ok: boolean }>) {
  const ok: boolean = m.ok; // the returned field, merged (required)
  const payload: string | undefined = m.payload; // the processed record, carried
  // @ts-expect-error — `_msgid` is deliberately not typed (hidden from authors)
  m._msgid;
  return { ok, payload };
}

// --- COMPLETE port (void return): only the carried record — no return fields --
function completeVoidProof(m: CompletePortOutput<In, void>) {
  const payload: string | undefined = m.payload;
  // @ts-expect-error — a void return contributes no fields
  m.ok;
  return { payload };
}

// --- STATUS port: the `status` block (provenance rides msg[Meta] at runtime) --
function statusRootProof(m: StatusPortOutput) {
  // @ts-expect-error — `_msgid` is deliberately not typed (hidden from authors)
  m._msgid;
  // @ts-expect-error — provenance rides msg[Meta], never a typed root key
  m.source;
  return { status: m.status };
}

// --- MessageSource (`msg[Meta].source`): node identity + port -----------------
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
