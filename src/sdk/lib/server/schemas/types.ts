import type {
  Static,
  TSchema,
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
} from "../../shared/schemas";
import type TypedInput from "../typed-input";
// The named-port brand is node port vocabulary, not schema vocabulary; it lives
// with the other port types. `Infer`'s record branch tags with it (a schema can
// *drive* a named-port output map), so it's imported back here.
import type { NamedPortsBrand } from "../nodes/types/ports";

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

export type { Infer, ResolvedStatic };
