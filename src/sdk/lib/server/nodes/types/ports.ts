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

/** The authoritative metadata layered onto every error-port message. */
interface ErrorInfo {
  name: string;
  message: string;
  source: NodeSource;
}

/**
 * Message emitted on the built-in ERROR port. The failing input rides along —
 * spread at the top level (Catch-node compatible) and preserved under `input` as
 * the provenance frame — alongside the `error` block. `TError` captures the
 * author's extra data: the enumerable own properties of a thrown `Error`
 * subclass, or the `msg` passed to `this.error(message, msg)`. `name`/`message`/
 * `source` stay authoritative over `TError`.
 */
type ErrorPortOutput<
  TInput = unknown,
  TError extends object = object,
> = TInput & {
  error: Omit<TError, keyof ErrorInfo> & ErrorInfo;
  input: TInput;
};

/**
 * Message emitted on the built-in COMPLETE port. The input rides along (spread +
 * under `input`); when `input()` returns a value it is carried under the return
 * key (`output` by default) as `TReturn`. A `void`-returning node omits it.
 */
type CompletePortOutput<TInput = unknown, TReturn = void> = TInput & {
  complete: { source: NodeSource };
  input: TInput;
} & ([TReturn] extends [void] ? unknown : { output: TReturn });

/** Message emitted on the built-in STATUS port (no carried input/provenance). */
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
  OutputPortNames,
  NodeSource,
  ErrorInfo,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};
