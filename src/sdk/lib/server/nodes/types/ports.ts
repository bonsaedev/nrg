// Node port vocabulary. The type-level markers that make the GENERICS the source
// of truth for a node's ports — `Port<T>`, named-port detection, the addressable
// port names — plus the plain message types the IONode base class emits on the
// built-in error/complete/status ports. None of this is schema-related: schemas
// only *drive* these (via `Infer`) when an author opts in. Kept as a leaf module
// (imports nothing) so `schemas/types` can reference `NamedPortsBrand` from here
// for `Infer` without a cycle.

/**
 * String-key phantom brand stamped on the record form of {@link Infer} — a
 * named-port output map. It lets `send` and the test toolkit tell
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
 * class CsvParse extends IONode<Config, never, Input<Port<In>>,
 *   Outputs<{ rows: Port<Row[]>; failed: Port<{ line: number; reason: string }> }>> {
 *   async input(msg) { this.send("rows", parse(msg.payload)); } // "rows" | "failed" checked
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

/** The built-in lifecycle port names — RESERVED. A node emits to them via
 * `this.error()` / `this.status()` and the auto-emitted complete port, never
 * `send("error", …)` (the runtime throws on that). Excluded from the addressable
 * named-port keys so a data port that happens to share one of these names can't be
 * `send()`-targeted at the type level (which would type-check but throw). */
type BuiltinPortName = "error" | "complete" | "status";

/**
 * The addressable named-port keys of an output type: the record's port names
 * (minus the reserved {@link BuiltinPortName}s) when its values are {@link Port}s
 * (or it carries the legacy {@link NamedPortsBrand}); `string` when it's `any`;
 * else `never` (a single object output, a single `Port`, a tuple, or no outputs
 * has no named ports).
 */
type OutputPortNames<TOutput> =
  IsAny<TOutput> extends true
    ? string
    : TOutput extends NamedPortsBrand
      ? Exclude<keyof TOutput & string, keyof NamedPortsBrand | BuiltinPortName>
      : IsPortRecord<TOutput> extends true
        ? Exclude<keyof TOutput & string, BuiltinPortName>
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
 */
type Outputs<TPorts extends OutputSpec> = TPorts;

/**
 * The two off-the-wire lanes present on every message a node's `input()`
 * receives, added by the runtime — NEVER part of the serialized message, so a
 * flow author's function node and the debug panel can't see them. Each lane lives
 * in nrg's per-runtime store keyed by `_msgid`, reached through these accessors.
 *  - `protected`: readable/writable by a node from ANY package.
 *  - `private`: scoped to the receiving node's OWN package; invisible to others.
 *
 * The base `input(msg)` parameter is the node's `TInput` — an {@link Input}`<Port<…>>`
 * that already intersects these lanes — so the simplest way to read them is to OMIT
 * the parameter annotation: TypeScript infers `msg` from the base:
 *
 * @example
 * class N extends IONode<Config, never, Input<Port<{ payload: string }>>, Out> {
 *   async input(msg) {                     // no annotation
 *     const conn = msg.private.conn;       // package-scoped; `unknown` until narrowed
 *     this.send("out", { trace }, { conn }); // write the lanes
 *     delete msg.private.conn;             // release (bookkeeping only)
 *   }
 * }
 *
 * Re-annotating the parameter with the bare wire type discards the lanes (a
 * TypeScript override rule). To annotate explicitly, reuse the node's own
 * `Input<Port<…>>` alias.
 */
interface MessageLanes {
  protected: Record<string, unknown>;
  private: Record<string, unknown>;
}

/**
 * Framework-internal message metadata. `_msgid` is Node-RED's message-lineage id
 * and nrg's off-the-wire lane key. It is DELIBERATELY NOT part of
 * {@link Input} — a node author never sees `msg._msgid` in autocomplete and
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
 * `Input<Port<TWire>>` — the input gate. A node's single input is a PORT carrying
 * the on-the-wire type `TWire`; `Input<>` unwraps that {@link Port} and adds the
 * off-the-wire lanes ({@link MessageLanes}). Authors declare it as
 * `type SoqlInput = Input<Port<{ … }>>` and pass it as the node's `TInput` generic;
 * the base `IONode.input(msg: SoqlInput)` parameter is then exactly `TWire` plus
 * the lanes, so a node reads `msg.<wireField>` and `msg.private` / `msg.protected` —
 * all typed. Wrapping the wire in `Port<>` mirrors the output side
 * (`Outputs<{ p: Port<T> }>`), so `Port<T>` reads as "a port carrying T" in BOTH
 * directions. The `TInput` generic is constrained `TInput extends Input<Port<unknown>>`,
 * so a bare (unwrapped) wire is rejected — the `Port<>` wrap is enforced; `never`
 * (a source node with no input) still satisfies it. `_msgid` ({@link MessageMeta})
 * stays excluded — it's the framework's internal lane key, not an author-facing
 * field. To annotate `input()` explicitly, reuse the same `Input<Port<…>>` alias.
 */
type Input<TPort extends Port<unknown> = Port<unknown>> = PortValue<TPort> &
  MessageLanes;

/**
 * The constraint on a node's `TInput` generic — the set of valid input shapes:
 * an {@link Input} of any {@link Port} (the wire plus the off-the-wire lanes),
 * which reduces to "carries the {@link MessageLanes}". Symmetric to
 * {@link OutputSpec} on the output side, so the node generics read
 * `TInput extends InputSpec` / `TOutput extends OutputSpec`. `never` (a source
 * node with no input) satisfies it.
 */
type InputSpec = Input<Port<unknown>>;

/**
 * Recover the pure WIRE type from a wrapped {@link Input} by stripping the lanes —
 * used wherever the framework needs the on-the-wire shape (the `receive` message,
 * the `msg.input` provenance frame, port topology). `never` (a source) stays
 * `never` so its `receive` is uncallable.
 */
type OmitMessageLanes<TInput> = [TInput] extends [never]
  ? never
  : Omit<TInput, keyof MessageLanes>;

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
 * over `TError`. Node-RED's `_msgid` rides the root at runtime but is deliberately
 * NOT typed here — the framework's lineage/lane key stays hidden from authors,
 * exactly as it is on the input side (see {@link MessageMeta}).
 */
type ErrorPortOutput<TInput = unknown, TError extends object = object> = {
  error: Omit<TError, keyof ErrorInfo> & ErrorInfo;
  source: NodeSource;
  input: TInput;
};

/**
 * Message emitted on the built-in COMPLETE port. `source` (who completed it) and
 * `input` (the message it was processing) ride the root. The `complete` key
 * carries `input()`'s return value (`TReturn`) when there is one; a `void` return
 * omits `complete` entirely — arrival on the complete wire is itself the signal.
 * Node-RED's `_msgid` rides the root at runtime but is deliberately not typed here
 * (framework-internal, hidden from authors — see {@link MessageMeta}).
 */
type CompletePortOutput<TInput = unknown, TReturn = void> = {
  source: NodeSource;
  input: TInput;
} & ([TReturn] extends [void] ? unknown : { complete: TReturn });

/** Message emitted on the built-in STATUS port (no carried input/provenance).
 * Node-RED's `_msgid` rides the root at runtime but is deliberately not typed here
 * (framework-internal, hidden from authors — see {@link MessageMeta}). */
interface StatusPortOutput {
  status:
    | {
        fill?: "red" | "green" | "yellow" | "blue" | "grey" | "gray";
        shape?: "ring" | "dot";
        text?: string;
      }
    | string;
  source: NodeSource;
}

export type {
  NamedPortsBrand,
  Port,
  PortValue,
  IsAny,
  IsPortRecord,
  OutputPortNames,
  Outputs,
  OutputSpec,
  MessageLanes,
  MessageMeta,
  Input,
  InputSpec,
  OmitMessageLanes,
  NodeSource,
  MessageSource,
  ErrorInfo,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};
