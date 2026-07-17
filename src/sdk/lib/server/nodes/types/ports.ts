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
interface Port<T, TChannels extends ChannelShape = object> {
  readonly __nrg_port: T;
  /**
   * Phantom brand for the port's off-the-wire {@link ChannelShape} — what a node
   * WRITES on `send` (output ports) and READS via `msg[Channels]` (input ports).
   * Declared ONCE on the port and enforced on both ends. Optional and defaulting to
   * `object` (untyped), so a plain `Port<T>` stays valid and behaves exactly as before.
   */
  readonly __nrg_channels?: TChannels;
}

/** Unwrap a {@link Port} to its message type; pass a non-Port through unchanged. */
type PortValue<P> = P extends Port<infer U, ChannelShape> ? U : P;

/** Unwrap a {@link Port}'s off-the-wire {@link ChannelShape}; `object` (untyped) for a
 *  `Port<T>` that declares none. */
type PortChannels<P> = P extends Port<unknown, infer C> ? C : object;

/** The `send(port, value, channels)` channel argument derived from a port: both
 *  partitions optional, declared keys typed (so `send` gives intellisense and enforces
 *  a required key), arbitrary keys still allowed via the open bag. */
type WriteChannels<TPort> = Partial<MessageChannels<PortChannels<TPort>>>;

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
 * The single channel-accessor symbol. Import it to read or write a message's
 * off-the-wire channels — `msg[Channels].private` / `msg[Channels].protected`. A
 * SYMBOL key (not a string property), so it can NEVER collide with an author's own
 * message fields and is invisible to `JSON`, `Object.keys`, and the debug panel for
 * free. `Symbol.for` (the global registry) makes the key a consumer imports
 * identical to the one nrg installs the accessor under, across the toolkit/runtime
 * bundle split. Grouping the channels under ONE symbol keeps the message surface
 * tidy and leaves room to add further channels without new top-level keys.
 */
const Channels: unique symbol = Symbol.for("nrg.channels");

/**
 * The message-METADATA accessor symbol. Import it to read the framework metadata
 * riding beside a message's data — `msg[Meta].source` is the producing node + port
 * of THIS message, stamped by the framework on every `send` (a node author never
 * writes it). A SYMBOL key for the same reasons as {@link Channels}: it can never
 * collide with an author's data fields and stays off `JSON`/`Object.keys`.
 *
 * The accessor is INSTALLED AT DELIVERY over a clone-safe root carrier (today the
 * `source` root key the framework already stamps — a root key survives Node-RED's
 * fan-out clone, which drops symbol properties). `msg[Meta]` is the STABLE author
 * surface: the carrier can move without touching node code.
 */
const Meta: unique symbol = Symbol.for("nrg.meta");

/** A single off-the-wire channel: an open bag of string-keyed values, read (and
 * `delete`-d) through the `msg[Channels]` accessor and written on `send`. */
type MessageChannel = Record<string, unknown>;

/**
 * An optional TYPED shape for a message's channel partitions, passed as the second
 * argument to {@link Input} (e.g. `Input<Port<Wire>, { private: { conn?: Conn } }>`).
 * A declared partition is intersected with the open {@link MessageChannel} bag, so
 * the named keys are typed while arbitrary string keys stay reachable as `unknown`
 * and existing untyped code is unaffected. The shape is a hand-shared contract
 * between the node that WRITES it on `send` and the node that READS it: the channel
 * is off-the-wire (keyed by `_msgid`, never on a connection), so the type cannot
 * flow through a wire and must be declared on both ends. Omit it to keep the default
 * fully-untyped `Record<string, unknown>` on both partitions.
 */
type ChannelShape = { protected?: object; private?: object };

/**
 * What `msg[Channels]` returns — the off-the-wire channels present on every message
 * a node's `input()` receives, added by the runtime and NEVER part of the serialized
 * message, so a flow author's function node and the debug panel can't see them. Each
 * channel lives in nrg's per-runtime store keyed by `_msgid`, reached through the
 * {@link Channels} symbol.
 *  - `protected`: readable/writable by a node from ANY package.
 *  - `private`: scoped to the receiving node's OWN package; invisible to others.
 *
 * Read them from an ANNOTATED `input()` parameter — annotate with the node's own
 * `Input<Port<…>>` alias. (TypeScript does NOT infer an overridden method's
 * parameter type from the base class, so an un-annotated `input(msg)` is `any` and
 * loses all typing — always annotate.)
 *
 * @example
 * import { Channels } from "@bonsae/nrg/server";
 * type NInput = Input<Port<{ payload: string }>>;
 * class N extends IONode<Config, never, NInput, Out> {
 *   async input(msg: NInput) {
 *     const conn = msg[Channels].private.conn;   // package-scoped; `unknown` until narrowed
 *     this.send("out", { trace }, { private: { conn } });  // write the channels
 *     delete msg[Channels].private.conn;         // release (bookkeeping only)
 *   }
 * }
 */
interface MessageChannels<TShape extends ChannelShape = object> {
  protected: MessageChannel &
    ("protected" extends keyof TShape ? TShape["protected"] : unknown);
  private: MessageChannel &
    ("private" extends keyof TShape ? TShape["private"] : unknown);
}

/**
 * Carries the symbol-keyed channel accessor. {@link Input} intersects this onto a
 * node's input wire type so `msg[Channels]` resolves to {@link MessageChannels}; the
 * wiring `.d.ts` generator strips it back off, so a connection carries only the plain
 * wire type. Hand-annotate with `Wire & WithMessageChannels` only when you are not
 * using the `Input<Port<Wire>>` gate (which adds it for you).
 */
interface WithMessageChannels<TShape extends ChannelShape = object> {
  readonly [Channels]: MessageChannels<TShape>;
}

/**
 * Framework-internal message metadata. `_msgid` is Node-RED's message-lineage id
 * and nrg's off-the-wire channel key. It is DELIBERATELY NOT part of
 * {@link Input} — a node author never sees `msg._msgid` in autocomplete and
 * can't read or overwrite it through the typed parameter, because doing so would
 * fork the message from its channels and break correlation. The framework reads it
 * internally (via a cast) to key the channel store, and the test harness's
 * `ExtractInput` strips it so `receive()` takes the bare wire message.
 * (It still exists at runtime — Node-RED always delivers it — so a determined
 * author can reach it with an explicit `(msg as { _msgid: string })`, an opt-in
 * that keeps it out of the everyday surface.)
 */
interface MessageMeta {
  _msgid: string;
}

/**
 * What `msg[Meta]` returns — the framework metadata beside the data. `source` is
 * the producing node + port of this message; `undefined` when the upstream
 * producer wasn't an nrg node (a core node, an inject, a test message). Read-only:
 * the framework stamps it on `send`; an author never writes it.
 */
interface MessageMetadata {
  readonly source?: MessageSource;
}

/**
 * The metadata-accessor carrier intersected into every {@link Input} — the `[Meta]`
 * twin of {@link WithMessageChannels}. Structural and additive: it adds only the
 * symbol-keyed accessor, so wire shapes, port topology, and the `InputSpec` bound
 * are unaffected.
 */
interface WithMeta {
  readonly [Meta]: MessageMetadata;
}

/**
 * `Input<Port<TWire, TChannels>>` — the input gate. A node's single input is a PORT
 * carrying the on-the-wire type `TWire` and (optionally) a typed off-the-wire
 * {@link ChannelShape}; `Input<>` unwraps the {@link Port} into `TWire` plus the
 * off-the-wire channels ({@link MessageChannels}) typed by the port's `TChannels`.
 * Authors declare it as `type SoqlInput = Input<Port<{ … }>>` (or
 * `Input<Port<{ … }, { private: { conn?: Conn } }>>` to type the channels) and pass it
 * as the node's `TInput` generic; the annotated `input(msg: SoqlInput)` parameter is
 * then exactly `TWire` plus the channels, so a node reads `msg.<wireField>` and
 * `msg[Channels].private` / `msg[Channels].protected` — all typed. The channel shape
 * lives on the {@link Port} (NOT on `Input`), so it is symmetric with the output side
 * (`Outputs<{ p: Port<T, C> }>`), where the same `C` types what `send` may write. The
 * `TInput` generic is constrained `TInput extends InputSpec` (carries the channels),
 * so a bare (unwrapped) wire is rejected — the `Port<>` wrap is enforced; `never` (a
 * source node with no input) still satisfies it. `_msgid` ({@link MessageMeta}) stays
 * excluded. ALWAYS annotate `input()` with this alias: TypeScript does not infer an
 * overridden method's parameter from the base, so an un-annotated `input(msg)` is `any`.
 */
type Input<TPort extends Port<unknown> = Port<unknown>> = PortValue<TPort> &
  WithMessageChannels<PortChannels<TPort>> &
  WithMeta;

/**
 * The constraint on a node's `TInput` generic — "carries the {@link MessageChannels}
 * accessor". Kept STRUCTURAL (an inline carrier, not `WithMessageChannels<…>`) so a
 * node that declares a typed channel shape via {@link Input}'s second parameter still
 * satisfies it: a declared shape only NARROWS a partition, and structural assignability
 * accepts a narrower partition — whereas comparing the generic by type-argument is
 * invariant and would reject it. The old `Input<Port<unknown>>` reduced to
 * `WithMessageChannels<object>` (the wire is `unknown`), which is exactly this shape,
 * so the bound is unchanged for untyped inputs. `never` (a source node with no input)
 * satisfies it. Symmetric to {@link OutputSpec} on the output side.
 */
type InputSpec = {
  readonly [Channels]: { protected: MessageChannel; private: MessageChannel };
};

/**
 * Recover the pure WIRE type from a wrapped {@link Input} by stripping the channels —
 * used wherever the framework needs the on-the-wire shape (the `receive` message,
 * the `msg.input` provenance frame, port topology). `never` (a source) stays
 * `never` so its `receive` is uncallable.
 */
type OmitMessageChannels<TInput> = [TInput] extends [never]
  ? never
  : Omit<TInput, keyof WithMessageChannels | keyof WithMeta>;

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
 * NOT typed here — the framework's lineage/channel key stays hidden from authors,
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
  Port,
  PortValue,
  PortChannels,
  WriteChannels,
  IsAny,
  IsPortRecord,
  OutputPortNames,
  Outputs,
  OutputSpec,
  MessageChannel,
  ChannelShape,
  MessageChannels,
  WithMessageChannels,
  MessageMeta,
  MessageMetadata,
  WithMeta,
  Input,
  InputSpec,
  OmitMessageChannels,
  NodeSource,
  MessageSource,
  ErrorInfo,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};

export { Channels, Meta };
