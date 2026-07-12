import type {
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
  MessageSource,
  NodeSource,
  OutputPortNames,
  Port,
} from "@/sdk/lib/server/nodes/types/ports";

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
