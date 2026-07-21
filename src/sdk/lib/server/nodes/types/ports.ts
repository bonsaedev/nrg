// Node port vocabulary. The type-level markers that make the GENERICS the source
// of truth for a node's ports — `Port<T>`, named-port detection, the addressable
// port names — plus the plain message types the IONode base class emits on the
// built-in error/complete/status ports. None of this is schema-related: schemas
// only *drive* these (via `Infer`) when an author opts in. Kept as a leaf module
// (imports nothing).

/** True only for `any` (distributes via the `1 & T` trick). */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * A single output PORT carrying a message of type `T`. Type-only marker (a
 * phantom brand — never present at runtime). A `Record` whose values are all
 * `Port`s is read as NAMED ports (topology + names), which disambiguates it from
 * a plain object type (which is ONE object port) — the ambiguity that means a
 * bare `{ a; b }` can't declare two ports. Composes with `Infer` for a
 * schema-typed port: `Port<Infer<typeof schema>>`.
 *
 * @example
 * class CsvParse extends IONode<Config, never, Input<Port<In>>,
 *   Outputs<{ rows: Port<Row[]>; failed: Port<{ line: number; reason: string }> }>> {
 *   async input(msg: Input<Port<In>>) { this.send("rows", parse(msg.payload)); } // "rows" | "failed" checked
 * }
 */
interface Port<TMessage> {
  readonly __nrg_port: TMessage;
}

/** Unwrap a {@link Port} to its message type; pass a non-Port through unchanged. */
type PortValue<P> = P extends Port<infer U> ? U : P;

/** True when every value of a record is a {@link Port} (→ named ports). */
type IsPortRecord<TOutput> = [keyof TOutput] extends [never]
  ? false
  : TOutput[keyof TOutput] extends Port<any>
    ? true
    : false;

/** The built-in lifecycle port names — RESERVED. A node emits to them via
 * `throw` (error), `this.status()` (status), and the auto-emitted complete port
 * (input()'s return), never `send("error", …)` (the runtime throws on that).
 * Excluded from the addressable named-port keys so a data port that happens to
 * share one of these names can't be `send()`-targeted at the type level (which
 * would type-check but throw). */
type BuiltinPortName = "error" | "complete" | "status";

/**
 * The addressable named-port keys of an output type: the record's port names
 * (minus the reserved {@link BuiltinPortName}s) when its values are {@link Port}s;
 * `string` when it's `any`; else `never` (a single object output, a single `Port`,
 * a tuple, or no outputs has no named ports). An index-signature record
 * (`Record<string, Port<T>>`, whose `keyof` is `string`) has NO statically-enumerable
 * names and the build injects no ports for it, so it too resolves to `never` —
 * otherwise `send()` would accept any name the runtime rejects.
 */
type OutputPortNames<TOutput> =
  IsAny<TOutput> extends true
    ? string
    : IsPortRecord<TOutput> extends true
      ? string extends keyof TOutput
        ? never
        : Exclude<keyof TOutput & string, BuiltinPortName>
      : never;

/**
 * The constraint on a node's `TOutput` generic — the set of valid output shapes:
 * a record of NAMED {@link Port}s (static ports), an array of {@link Port}s
 * (dynamic, index-addressed ports), or `never` (a sink). Every port is named except
 * the dynamic array; a bare unnamed `Port<T>` and a raw plain object are both
 * rejected — name each port with {@link Outputs}.
 */
type OutputSpec = Record<string, Port<any>> | readonly Port<any>[];

/**
 * `Outputs<TPorts>` — the output gate. Every port is NAMED: pass a record mapping
 * each port name to a {@link Port}. A single output is therefore a one-key record —
 * there are no unnamed/positional ports, so the framework never has to guess a
 * port's identity. Authors wrap their ports and pass it as the `TOutput` generic
 * (`type FooOutputs = Outputs<{ … }>`):
 *  - `Outputs<{ result: Port<{ payload: number }> }>` → one named port `result`
 *  - `Outputs<{ ok: Port<A>; err: Port<B> }>`         → two named ports `ok` / `err`
 *  - `Outputs<Port<T>[]>`                              → N dynamic ports (by index)
 * `never` (a sink) needs no wrapping. A plain object or a bare unnamed `Port<T>` is
 * rejected at the `Outputs<>` call — name each port. Emission is always by name (or
 * index for the dynamic array): `this.send("ok", value)`.
 *
 * Each port must be REQUIRED. An optional entry (`{ ok?: Port<A> }`) makes the
 * record's values include `undefined`, so it fails the {@link IsPortRecord} test
 * and NONE of its keys become addressable ({@link OutputPortNames} is `never`) —
 * a port either exists or it does not, so declare every port required.
 */
type Outputs<TPorts extends OutputSpec> = TPorts;

/**
 * Framework-internal message metadata. `_msgid` is Node-RED's message-lineage id.
 * It is DELIBERATELY NOT part of {@link Input} — a node author never sees
 * `msg._msgid` in autocomplete and can't read or overwrite it through the typed
 * parameter. The test harness's `ExtractInput` strips it so `receive()` takes the
 * bare wire message. (It still exists at runtime — Node-RED always delivers it — so
 * a determined author can reach it with an explicit `(msg as { _msgid: string })`.)
 */
interface MessageMeta {
  _msgid: string;
}

/**
 * The framework provenance the runtime stamps on the `_meta` root key of every
 * message an nrg node dispatches: `source` is the producing node + port of THIS
 * message. It rides an ENUMERABLE root key (`_meta`), so it survives Node-RED's
 * fan-out clone — a downstream node reads `msg._meta.source` directly, no accessor.
 * The framework writes it on every `send`; an author never writes it. To READ it, a
 * node DECLARES `_meta` on its input `Port` (`Input<Port<{ …; _meta: MessageMetadata }>>`)
 * — the wire check treats it like any field, so it type-checks green from an nrg
 * upstream and red from a plain core node (which stamps no `_meta`).
 */
interface MessageMetadata {
  readonly source?: MessageSource;
}

/**
 * `Input<Port<TWire>>` — the input gate. A node's single input is a PORT carrying the
 * on-the-wire type `TWire`; `Input<>` unwraps the {@link Port} into `TWire`. Authors
 * declare it as `type SoqlInput = Input<Port<{ … }>>` and pass it as the node's
 * `TInput` generic; the annotated `input(msg: SoqlInput)` parameter is then exactly
 * `TWire`, so a node reads `msg.<wireField>` — all typed. To read the framework
 * provenance, add `_meta: MessageMetadata` to the wire type and read `msg._meta.source`.
 * `_msgid` ({@link MessageMeta}) stays framework-internal. ALWAYS annotate `input()`
 * with this alias: TypeScript does not infer an overridden method's parameter from the
 * base, so an un-annotated `input(msg)` is `any`.
 */
type Input<TPort extends Port<unknown> = Port<unknown>> = PortValue<TPort>;

/**
 * The constraint on a node's `TInput` generic. Any input shape (a wrapped {@link Input}
 * or `never` for a source node) satisfies it — the {@link Port} wrap is the authoring
 * convention rather than a type-enforced bound now that `Input<>` is a pure unwrap.
 * Symmetric to {@link OutputSpec} on the output side.
 */
type InputSpec = unknown;

// --- Built-in port message types ---
// Server-owned PLAIN types that model exactly what the IONode base class emits
// on the built-in ports (see io-node.ts `#sendToPort` sites). Formerly derived
// from server base schemas via `Static<>`, but nothing validated against those
// schemas at runtime — they were pure type surface, so the shapes live directly
// as types. `ErrorPortOutput`/`CompletePortOutput` are generic over the carried
// input (and the author's extra data / return value) so a downstream handler can
// read the original message, the `input` provenance frame, and custom fields.

/** Provenance of a message: which node produced a built-in-port message.
 * `name` is `string | undefined` — a Node-RED node need not be named, and the
 * runtime emits `this.node.name` verbatim (the old schema's `string` was an
 * unenforced contract the runtime never actually honoured). */
interface NodeSource {
  id: string;
  type: string;
  name: string | undefined;
}

/**
 * Provenance of a message: the producing node ({@link NodeSource}) plus the port
 * it was sent on. Read via `msg._meta.source` (the `_meta` root key is the
 * clone-safe carrier the framework stamps). Every frame carries a port index — a
 * built-in lifecycle port occupies a real slot in the node's TOTAL output layout
 * (base ports first, then the enabled error/complete/status in that order), and
 * stamps that slot index with the built-in name as `portName`.
 */
interface MessageSource extends NodeSource {
  /** Output port index the message was sent on, within the node's total output
   * layout (base ports, then enabled built-ins in error → complete → status
   * order). */
  port: number;
  /** Named-port name (a `Port<T>` record output), or the built-in port name
   * (`"error"` / `"complete"` / `"status"`) for a lifecycle frame. */
  portName?: string;
}

/** The authoritative metadata in an error-port message's `error` block. `stack`
 * preserves the thrown Error's trace (non-enumerable on Error, so it is carried
 * explicitly); absent when the thrown value was not an Error or had no stack. */
interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
}

/**
 * The record fields carried forward on a lifecycle-port frame: the PROCESSED
 * record's fields, typed optional (a lifecycle emission can also fire with no
 * record in scope — a source node, a status() outside input()). `never` (a
 * source node) and an untyped input both collapse to `unknown` so the frame
 * stays readable.
 */
type CarriedRecord<TInput> = [TInput] extends [never]
  ? unknown
  : unknown extends TInput
    ? unknown
    : Partial<TInput>;

/**
 * Message emitted on the built-in ERROR port — the same MERGE rule as every
 * port: the frame is the PROCESSED RECORD plus the `error` block
 * (`name`/`message`/`stack` layered over the author's extra fields — the
 * enumerable own properties of a thrown `Error` subclass). The error port is
 * emitted by `throw` only (the terminal failure that carries the record);
 * `this.error()` is log-only. A downstream handler reads `msg.error` AND the
 * record that failed, side by side. Provenance rides the `_meta.source` root key;
 * Node-RED's `_msgid` rides the root at runtime but is deliberately NOT typed
 * (framework-internal, hidden from authors — see {@link MessageMeta}).
 */
type ErrorPortOutput<
  TInput = unknown,
  TError extends object = object,
> = CarriedRecord<TInput> & {
  error: Omit<TError, keyof ErrorInfo> & ErrorInfo;
};

/**
 * Message emitted on the built-in COMPLETE port — the same MERGE rule as every
 * port: the frame is the PROCESSED RECORD plus `input()`'s returned FIELDS
 * (`TReturn`, a plain object — the return value IS the complete-port record
 * contribution). A `void` return contributes nothing — arrival on the complete
 * wire is itself the signal. Provenance rides the `_meta.source` root key; Node-RED's
 * `_msgid` is at the root at runtime but deliberately NOT typed here
 * (framework-internal, hidden from authors — see {@link MessageMeta}).
 */
type CompletePortOutput<
  TInput = unknown,
  TReturn = void,
> = CarriedRecord<TInput> & ([TReturn] extends [void] ? unknown : TReturn);

/** Message emitted on the built-in STATUS port — the processed record (when a
 * record was in scope) plus `status`. Provenance rides the `_meta.source` root key;
 * `_msgid` is at the root at runtime but deliberately not typed here
 * (framework-internal, hidden from authors — see {@link MessageMeta}). */
interface StatusPortOutput {
  status:
    | {
        fill?: "red" | "green" | "yellow" | "blue" | "grey" | "gray";
        shape?: "ring" | "dot";
        text?: string;
      }
    | string;
}

export type {
  Port,
  PortValue,
  IsAny,
  IsPortRecord,
  OutputPortNames,
  Outputs,
  OutputSpec,
  MessageMeta,
  MessageMetadata,
  Input,
  InputSpec,
  NodeSource,
  MessageSource,
  ErrorInfo,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};
