import type {
  Static,
  TSchema,
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
} from "../../shared/schemas";
import type TypedInput from "../typed-input";
import type {
  NodeSourceSchema,
  ErrorPortOutputSchema,
  CompletePortOutputSchema,
  StatusPortOutputSchema,
} from "./base";

/**
 * Maps a schema's static type to the values server node code sees at
 * runtime: NodeRef brands resolve to the referenced node instance and
 * TypedInput brands resolve to the `TypedInput<T>` wrapper (with `.resolve()`).
 * The client counterpart (`EditorStatic` in client/types) maps the same brands
 * — shared via shared/schemas/types — to raw editor form values instead.
 *
 * Every cross-plane brand shares a `readonly __payload` field. The arm before
 * the generic `object` mapping is a loud-failure net: a brand that reached here
 * matched none of the explicit arms above, so it's an NRG brand this resolver
 * doesn't handle yet — map it to `never` (a compile error at every use site)
 * instead of letting the `object` arm silently deep-map the brand's internal
 * shape into a bogus type. Add a new brand's arm above, or its uses go `never`.
 */
type ResolvedStatic<T> =
  T extends NodeRefBrand<infer I>
    ? I
    : T extends TypedInputBrand<infer U>
      ? TypedInput<U>
      : T extends UnsafeBrand<infer V>
        ? V
        : T extends (...args: any[]) => any
          ? T
          : T extends Array<infer Item>
            ? ResolvedStatic<Item>[]
            : T extends { readonly __payload: any }
              ? never
              : T extends object
                ? { [K in keyof T]: ResolvedStatic<T[K]> }
                : T;

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
 * Infers the TypeScript type from a schema or a record of schemas.
 *
 * - Single schema: `Infer<typeof MySchema>` → the inferred message type
 * - Record of schemas: `Infer<typeof outputsSchema>` → `{ portName: InferredType }`
 *   port map, tagged with {@link NamedPortsBrand} so named-port routing is sound.
 *
 * The record form produces a simple mapped type that resolves eagerly,
 * giving `sendToPort()` proper autocomplete in class-based nodes.
 */
type Infer<T extends TSchema | Record<string, TSchema>> = T extends TSchema
  ? ResolvedStatic<Static<T>>
  : {
      [K in keyof T & string]: T[K] extends TSchema
        ? ResolvedStatic<Static<T[K]>>
        : never;
    } & NamedPortsBrand;

type InferOr<T, Fallback> = T extends TSchema ? Infer<T> : Fallback;

// The record branch delegates to `Infer<T>` (a single producer of the branded
// named-port map) so both `defineIONode` (via this alias) and class authors (via
// `Infer<typeof outputs>` directly) tag named-port outputs identically.
type InferOutputs<T> = T extends readonly TSchema[]
  ? { [K in keyof T]: T[K] extends TSchema ? Infer<T[K]> : never }
  : T extends TSchema
    ? Infer<T>
    : T extends Record<string, TSchema>
      ? Infer<T>
      : any;

// --- Built-in port message types ---
// Server-owned: they derive from the server base port schemas (./base). The
// server tree resolves them here rather than from the shared kit because the
// port schemas themselves are server-only.

/** Provenance of a message (which node/port produced it), carried on error output. */
type NodeSource = Static<typeof NodeSourceSchema>;

/** Message shape emitted on the built-in error port. */
type ErrorPortOutput = Static<typeof ErrorPortOutputSchema>;

/** Message shape emitted on the built-in complete port. */
type CompletePortOutput = Static<typeof CompletePortOutputSchema>;

/** Message shape emitted on the built-in status port. */
type StatusPortOutput = Static<typeof StatusPortOutputSchema>;

export type {
  Infer,
  InferOr,
  InferOutputs,
  Port,
  PortValue,
  ResolvedStatic,
  NamedPortsBrand,
  OutputPortNames,
  NodeSource,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
};
