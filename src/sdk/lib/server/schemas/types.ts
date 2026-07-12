import type {
  Static,
  TSchema,
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
} from "../../shared/schemas";
import type TypedInput from "../typed-input";

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
 * Infers the TypeScript type of a single schema: `Infer<typeof MySchema>` → the
 * inferred message type (with NodeRef/TypedInput brands resolved to their runtime
 * values). Compose it with the port gates to type a node's I/O from a schema, e.g.
 * `Input<Port<Infer<typeof InputSchema>>>` or
 * `Outputs<{ out: Port<Infer<typeof OutputSchema>> }>` — the port topology comes
 * from the `Input`/`Outputs` generics, never from the schema.
 */
type Infer<T extends TSchema> = ResolvedStatic<Static<T>>;

export type { Infer, ResolvedStatic };
