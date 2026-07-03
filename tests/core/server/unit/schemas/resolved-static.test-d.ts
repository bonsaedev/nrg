import type { ResolvedStatic } from "@/core/server/schemas/types";
import type {
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
} from "@/core/shared/schemas";

// Type-only proofs for ResolvedStatic's loud-failure net (the
// `T extends { readonly __payload: any } ? never` arm). Never executed — tsc
// (via `pnpm validate:tsc`) verifies them.

// `[T] extends [never]` (tuple-wrapped so `never` doesn't distribute away).
type IsNever<T> = [T] extends [never] ? true : false;

// --- the net trips for an unhandled brand -----------------------------------
// A future NRG brand carries __payload but matches none of the explicit arms.
// Without the net it would hit the generic `object` arm and deep-map into a
// bogus structural type; the net maps it to `never` instead.
interface FutureBrand {
  readonly __nrg_future: true;
  readonly __payload: { host: string };
}
const netTrips: IsNever<ResolvedStatic<FutureBrand>> = true;
void netTrips;

// --- the net does NOT trip for the known brands (matched by earlier arms) ----
// NodeRef → its payload instance
const nodeRef: ResolvedStatic<NodeRefBrand<{ host: string }>> = { host: "x" };
void nodeRef;
// NodeRef must NOT collapse to never
const nodeRefLives: IsNever<ResolvedStatic<NodeRefBrand<{ host: string }>>> =
  false;
void nodeRefLives;
// Unsafe → its payload unchanged
const unsafe: ResolvedStatic<UnsafeBrand<{ conn: number }>> = { conn: 1 };
void unsafe;
// TypedInput → the wrapper (non-never)
const typedInputLives: IsNever<ResolvedStatic<TypedInputBrand<string>>> = false;
void typedInputLives;

// --- the net does NOT trip for ordinary object types ------------------------
// A plain data object (no __payload) still deep-maps, not never.
const plain: ResolvedStatic<{ a: string; b: number }> = { a: "x", b: 1 };
void plain;
const plainLives: IsNever<ResolvedStatic<{ a: string }>> = false;
void plainLives;
