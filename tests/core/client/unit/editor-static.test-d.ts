import type { EditorStatic } from "@/core/client/types";
import type {
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
} from "@/core/shared/schemas";

// Client-plane mirror of resolved-static.test-d.ts: proofs for EditorStatic's
// loud-failure net (`T extends { readonly __payload: any } ? never`). Never
// executed — tsc (via `pnpm validate:tsc`) verifies them.

type IsNever<T> = [T] extends [never] ? true : false;

// --- the net trips for an unhandled brand -----------------------------------
interface FutureBrand {
  readonly __nrg_future: true;
  readonly __payload: { host: string };
}
const netTrips: IsNever<EditorStatic<FutureBrand>> = true;
void netTrips;

// --- the net does NOT trip for the known brands -----------------------------
// NodeRef → the referenced node id string
const nodeRef: EditorStatic<NodeRefBrand<{ host: string }>> = "some-node-id";
void nodeRef;
const nodeRefLives: IsNever<EditorStatic<NodeRefBrand<{ host: string }>>> =
  false;
void nodeRefLives;
// Unsafe → its payload unchanged
const unsafe: EditorStatic<UnsafeBrand<{ conn: number }>> = { conn: 1 };
void unsafe;
// TypedInput → the raw editor pair (non-never)
const typedInputLives: IsNever<EditorStatic<TypedInputBrand<string>>> = false;
void typedInputLives;

// --- the net does NOT trip for ordinary object types ------------------------
const plain: EditorStatic<{ a: string; b: number }> = { a: "x", b: 1 };
void plain;
const plainLives: IsNever<EditorStatic<{ a: string }>> = false;
void plainLives;
