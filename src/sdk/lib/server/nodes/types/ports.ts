// Node port vocabulary. The type-level markers that make the GENERICS the source
// of truth for a node's ports — `Port<T>`, named-port detection, the addressable
// port names — plus the plain message types the IONode base class emits on the
// built-in error/complete/status ports. None of this is schema-related: schemas
// only *drive* these (via `Infer`) when an author opts in. Kept as a leaf module
// (imports nothing) so `schemas/types` can reference `NamedPortsBrand` from here
// for `Infer` without a cycle.

/**
 * String-key phantom brand stamped on the record form of {@link Infer} — a
 * named-port output map. It lets `sendToPort`, `send`, and the test toolkit tell
 * a named-port record apart from a single object output WITHOUT a fragile
 * structural `Record<string, Record<string, any>>` guess (which a primitive-valued
 * port, or an object-of-objects single output, both defeat). STRING key, never a
 * `unique symbol`: unique-symbol identity is per-`.d.ts`-declaration and fragments
 * across nrg's separately bundled types (same rule as `NodeRefBrand`). Type-level
 * only — never present at runtime, and never on the per-port message types.
 */
interface NamedPortsBrand {
  readonly __nrg_named_ports: true;
}

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
 * class CsvParse extends IONode<Config, never, In,
 *   { rows: Port<Row[]>; failed: Port<{ line: number; reason: string }> }> {
 *   async input(msg: In) { this.sendToPort("rows", parse(msg.payload)); } // "rows" | "failed" checked
 * }
 */
interface Port<T> {
  readonly __nrg_port: T;
}

/** Unwrap a {@link Port} to its message type; pass a non-Port through unchanged. */
type PortValue<P> = P extends Port<infer U> ? U : P;

/** True when every value of a record is a {@link Port} (→ named ports). */
type IsPortRecord<TOutput> = [keyof TOutput] extends [never]
  ? false
  : TOutput[keyof TOutput] extends Port<any>
    ? true
    : false;

/**
 * The addressable named-port keys of an output type: the record's port names
 * when its values are {@link Port}s (or it carries the legacy
 * {@link NamedPortsBrand}); `string` when it's `any`; else `never` (a single
 * object output, a single `Port`, a tuple, or no outputs has no named ports).
 */
type OutputPortNames<TOutput> =
  IsAny<TOutput> extends true
    ? string
    : TOutput extends NamedPortsBrand
      ? Exclude<keyof TOutput, keyof NamedPortsBrand> & string
      : IsPortRecord<TOutput> extends true
        ? keyof TOutput & string
        : never;

/**
 * The two off-the-wire lanes present on every message a node's `input()`
 * receives, added by the runtime — NEVER part of the serialized message, so a
 * flow author's function node and the debug panel can't see them. Each lane lives
 * in nrg's per-runtime store keyed by `_msgid`, reached through these accessors.
 *  - `protected`: readable/writable by a node from ANY package.
 *  - `private`: scoped to the receiving node's OWN package; invisible to others.
 *
 * The base `input(msg)` parameter is {@link InputMessage}`<Input>` — it already
 * intersects these lanes — so the simplest way to read them is to OMIT the
 * parameter annotation: TypeScript infers `msg` from the base, where `Input` is
 * the node's wire generic:
 *
 * @example
 * class N extends IONode<Config, never, { payload: string }, Out> {
 *   async input(msg) {                    // no annotation
 *     const conn = msg.private.conn;      // package-scoped; `unknown` until narrowed
 *     this.send(out, { trace }, { conn }); // write the lanes
 *     delete msg.private.conn;            // release (bookkeeping only)
 *   }
 * }
 *
 * Re-annotating the parameter with the raw wire type discards the lanes (a
 * TypeScript override rule). If you prefer an explicit annotation, spell it
 * `InputMessage<Input>`.
 */
interface MessageLanes {
  protected: Record<string, unknown>;
  private: Record<string, unknown>;
}

/**
 * Framework-internal message metadata. `_msgid` is Node-RED's message-lineage id
 * and nrg's off-the-wire lane key. It is DELIBERATELY NOT part of
 * {@link InputMessage} — a node author never sees `msg._msgid` in autocomplete and
 * can't read or overwrite it through the typed parameter, because doing so would
 * fork the message from its lanes and break correlation. The framework reads it
 * internally (via a cast) to key the lane store, and the test harness's
 * `ExtractInput` strips it so `receive()` takes the bare wire message.
 * (It still exists at runtime — Node-RED always delivers it — so a determined
 * author can reach it with an explicit `(msg as { _msgid: string })`, an opt-in
 * that keeps it out of the everyday surface.)
 */
interface MessageMeta {
  _msgid: string;
}

/**
 * The full message a node's `input()` receives: its wire shape `TInput` plus the
 * framework-added off-the-wire lanes ({@link MessageLanes}). The base
 * `IONode.input(msg)` parameter is `InputMessage<TInput>`, so OMITTING the
 * parameter annotation infers the wire shape and both lanes from the `Input`
 * generic. `_msgid` ({@link MessageMeta}) is intentionally excluded — it's the
 * framework's internal lane key, not an author-facing field. Authors who prefer
 * an explicit annotation can spell it `InputMessage<Input>` instead of
 * `Input & MessageLanes`.
 */
type InputMessage<TInput> = TInput & MessageLanes;

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
 * Provenance stamped on every DATA-port output under `msg.source`: the producing
 * node ({@link NodeSource}) plus the port the message was sent on. It rides the
 * message ROOT (beside `_msgid`), NOT inside `msg.output` — so `msg.output` stays
 * exactly the author's value. It travels the `input` chain, so `msg.input.source`,
 * `msg.input.input.source`, … identify the producer of each frame.
 */
interface MessageSource extends NodeSource {
  /** Base output port index the message was sent on. */
  port: number;
  /** Named-port name, when the node declares a `Port<T>` record output. */
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
 * Message emitted on the built-in ERROR port. The `error` block holds the error
 * data (`name`/`message`/`stack` plus the author's extra fields — the enumerable
 * own properties of a thrown `Error` subclass, or the `msg` passed to
 * `this.error(message, msg)`); `source` (the producing node) and `input` (the
 * failing message) ride the ROOT beside it — the same shape as every other port.
 * A downstream node reads `msg.error`. `name`/`message`/`stack` stay authoritative
 * over `TError`. `_msgid` (Node-RED's message-lineage id) rides the root too.
 */
type ErrorPortOutput<TInput = unknown, TError extends object = object> = {
  error: Omit<TError, keyof ErrorInfo> & ErrorInfo;
  source: NodeSource;
  input: TInput;
  _msgid: string;
};

/**
 * Message emitted on the built-in COMPLETE port. `source` (who completed it) and
 * `input` (the message it was processing) ride the root. The `complete` key
 * carries `input()`'s return value (`TReturn`) when there is one; a `void` return
 * omits `complete` entirely — arrival on the complete wire is itself the signal.
 */
type CompletePortOutput<TInput = unknown, TReturn = void> = {
  source: NodeSource;
  input: TInput;
  _msgid: string;
} & ([TReturn] extends [void] ? unknown : { complete: TReturn });

/** Message emitted on the built-in STATUS port (no carried input/provenance).
 * `_msgid` (Node-RED's message-lineage id) rides the root like every message. */
interface StatusPortOutput {
  status:
    | {
        fill?: "red" | "green" | "yellow" | "blue" | "grey" | "gray";
        shape?: "ring" | "dot";
        text?: string;
      }
    | string;
  source: NodeSource;
  _msgid: string;
}

export type {
  NamedPortsBrand,
  Port,
  PortValue,
  IsAny,
  OutputPortNames,
  MessageLanes,
  MessageMeta,
  InputMessage,
  NodeSource,
  MessageSource,
  ErrorInfo,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};
