import type { Static, TSchema } from "@sinclair/typebox";
import type TypedInput from "../../typed-input";
import type {
  NodeRefResolved,
  TypedInputResolved,
  UnsafeResolved,
} from "../../../types";

/**
 * Maps a schema's static type to the values server node code sees at
 * runtime: NodeRef brands resolve to the referenced node instance and
 * TypedInput brands resolve to the `TypedInput<T>` wrapper (with `.resolve()`).
 * The client counterpart (`EditorStatic` in client/types) maps the same brands
 * — shared via core/types — to raw editor form values instead.
 */
type ResolvedStatic<T> =
  T extends NodeRefResolved<infer I>
    ? I
    : T extends TypedInputResolved<infer U>
      ? TypedInput<U>
      : T extends UnsafeResolved<infer V>
        ? V
        : T extends (...args: any[]) => any
          ? T
          : T extends Array<infer Item>
            ? ResolvedStatic<Item>[]
            : T extends object
              ? { [K in keyof T]: ResolvedStatic<T[K]> }
              : T;

/**
 * Infers the TypeScript type from a schema or a record of schemas.
 *
 * - Single schema: `Infer<typeof MySchema>` → the inferred message type
 * - Record of schemas: `Infer<typeof outputsSchema>` → `{ portName: InferredType }` port map
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
    };

type InferOr<T, Fallback> = T extends TSchema ? Infer<T> : Fallback;

type InferOutputs<T> = T extends readonly TSchema[]
  ? { [K in keyof T]: T[K] extends TSchema ? Infer<T[K]> : never }
  : T extends TSchema
    ? Infer<T>
    : T extends Record<string, TSchema>
      ? { [K in keyof T & string]: Infer<T[K]> }
      : any;

export type { Infer, InferOr, InferOutputs, ResolvedStatic };

// Shared schema types live in core/shared/schemas/types — re-exported here so
// the long-standing `server/schemas/types` import surface stays intact.
export type * from "../../../shared/schemas/types";
