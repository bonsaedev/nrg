import type { Port } from "@/sdk/lib/server/nodes/types/ports";
import type { Input } from "@/sdk/lib/server";
import { IONode } from "@/sdk/lib/server";

// Type-level proof about the ARITY of an `input()` override — compiled by
// `tsc -p tests/tsconfig.json`, never executed.
//
// The base method is `input(msg: TInput): unknown`. TypeScript lets a subclass
// override DROP trailing parameters, so `async input()` with no `msg` type-checks.
// That is a GENERAL TypeScript rule, NOT anything special about `Port<{}>`: it
// holds whether the input reads nothing (`Port<{}>`) or reads real fields
// (`Port<{ x: string }>`). This file pins that truth so a future reader never
// mistakes "no-msg input() compiles" for a `Port<{}>` feature — it isn't one,
// and reading it as such would be a false positive.

type EmptyInput = Input<Port<{}>>;
type TypedInput = Input<Port<{ x: string }>>;

// (1) reads NOTHING — omitting `msg` compiles.
class NoMsgEmpty extends IONode<never, never, EmptyInput, never> {
  override async input() {
    return undefined;
  }
}

// (2) reads REAL fields — omitting `msg` STILL compiles. This is the load-bearing
//     proof: dropping `msg` is a general override capability, not `Port<{}>`-specific,
//     so the "async input() with no msg" observation was never a `Port<{}>` false
//     positive. If this ever stopped compiling, tsc would fail the class body here.
class NoMsgTyped extends IONode<never, never, TypedInput, never> {
  override async input() {
    return undefined;
  }
}

// (3) When `msg` IS annotated, an input that reads `{}` exposes no data fields —
//     `Input<Port<{}>>` reduces to `{}` (plus the symbol-keyed channel/meta
//     accessors), so any named field access is a type error.
class EmptyRead extends IONode<never, never, EmptyInput, never> {
  override async input(msg: EmptyInput) {
    // @ts-expect-error — reads `{}`, so there is no `anything` field on the record
    msg.anything;
    return undefined;
  }
}

// (4) A typed input reads exactly its declared fields — nothing more.
class TypedRead extends IONode<never, never, TypedInput, never> {
  override async input(msg: TypedInput) {
    const x: string = msg.x; // the declared field, typed
    void x;
    // @ts-expect-error — `y` was never declared on the input record
    msg.y;
    return undefined;
  }
}

export { NoMsgEmpty, NoMsgTyped, EmptyRead, TypedRead };
