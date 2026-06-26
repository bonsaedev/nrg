# Plan: auto-type `node.sent()[i][port]` from the declared output (no new method)

## Goal
After the uniform positional-array change ([[always-array-send-plan]]), `node.sent()`
returns one positional array per emission: `sent()[i] = [portMsg0, portMsg1, …]`.
This plan makes that array **precisely typed from the node's declared output**, so
`node.sent()[i][0].output` autocompletes to the declared value type — with **no new
method, no casts, no `any` in the public harness API**.

## Prerequisite (hard dependency)
This sits **on top of** the always-array change. Without it, a single-output node's
`sent()[i]` is a bare `{ output }` object, so `sent()[i][0]` would index into an
object — wrong. The always-array change is what makes `sent()[i]` an array at the
`node.send` mock boundary the harness records (`unit/index.ts:84`). **They should
land together**: always-array supplies the runtime+value shape; this supplies the
precise type. This plan *replaces* the placeholder `sent(): unknown[][]` from
always-array Phase B with the real typed version below.

## Source of truth: the generic, not the static schema
- `defineIONode` → `NodeConstructor<IIONode<…, InferOutputs<TOutputsSchema>>>`
  (`factories.ts:51-65`). The inferred output rides the instance via `send(msg: TOutput)`.
- The harness already harvests it: `ExtractOutput<T> = T extends { send(msg: infer O) } ? O : any`
  (`unit/index.ts:19`). **Keep it.**
- The static path is dead: `createNode<T extends NodeClass>` constrains `T` to
  `NodeConstructor`, whose `outputsSchema` is the bare union `TSchema | TSchema[] |
  Record<string,TSchema>` (`types/node.ts:42`) — zero literal info. Runtime reads the
  *value* `NodeClass.outputsSchema`; the *type* is erased.
- `InferOutputs` (`schemas/types/index.ts:88-94`) already gives us exactly three shapes:
  array schema → **ordered tuple**; record schema → **record**; single schema → **single type**.

## How far it goes — three tiers (the honest answer)

| Node shape | `TOutput` | `sent()[i][port]` typing | Why |
|---|---|---|---|
| **Single output** (99% — all salesforce/file-storage) | single type | **precise** — `sent()[i][0].output` is the declared value | one port; trivial |
| **Tuple multi-output** (`outputsSchema: [A, B]`, bare) | `[Infer<A>, Infer<B>]` | **precise positional** — `sent()[i][1].output` is port-1's type | tuple preserves index order |
| **Record multi-output** (named ports `{ok, catch}` — AWS fn-*) | `{ok:…, catch:…}` | **sound union** at `[i][k]`; **precise via `sent("ok")`** | see wall below |

### The one hard TypeScript wall
For **record-typed named ports**, position→type is **not recoverable in the type system**.
`keyof T` is an unordered set; runtime order comes from `Object.keys(schema).indexOf(name)`
(`io-node.ts:474`). So we **do not fabricate** a positional mapping for records — `sent()[i][k]`
degrades to `WrappedPort<union-of-port-values>` (sound, imprecise), while precise per-port
access stays on the existing **named** overload `sent("ok")` (`unit/index.ts:128`), which
resolves order at runtime. This is honest, not a lie-type.

> If precise *positional* typing for named ports is ever needed: the build-time
> type-generator already tracks `recordPortNames` in declaration order
> (`type-generator.ts:257-291`) and could emit an ordered tuple alias. Deferred —
> the named accessor already covers the need. (Checkpoint E.)

## Type definitions (all in `packages/toolkit/src/test/server/unit/index.ts`)
Keep `ExtractInput/ExtractOutput/PortNames/PortMessage` **unchanged** (they back the named overload).

```ts
// A single delivered port message. Default return key "output" holds the declared
// value V; carry/trace also spread arbitrary upstream keys (typed unknown, not
// falsely shaped); the author may rename the return key at runtime; lifecycle/
// unused port slots are undefined.
type WrappedPort<V> = ({ output: V } & { [extra: string]: unknown }) | undefined;

// Normalize TOutput into the positional fan-out array the runtime always delivers.
type PortTuple<TOutput> =
  TOutput extends readonly [any, ...any[]]                       // tuple schema
    ? { [K in keyof TOutput]: WrappedPort<TOutput[K]> }          //   precise positional
    : [TOutput] extends [Record<string, Record<string, any>>]   // record (named) schema
      ? string extends keyof TOutput
        ? WrappedPort<unknown>[]                                 //   open record → unknown
        : WrappedPort<TOutput[keyof TOutput]>[]                  //   closed record → union
      : [WrappedPort<TOutput>];                                  // single output → one slot
```

Verified by type-probe: `string[]` (single-output array *value*) → single branch
(`[WrappedPort<string[]>]`), NOT the tuple branch; homomorphic map over a tuple keeps
per-index precision (`sent()[i][0].output: A`, `[i][1].output: B`).

### `sent()` overloads — additive, most-specific first
```ts
sent(): PortTuple<TOutput>[];                                    // NEW — the goal
sent<P extends PortNames<TOutput>>(port: P): PortMessage<TOutput, P>[];  // UNCHANGED
sent(port: number): WrappedPort<unknown>[];                     // was any[] — drop the any
```
- Only the zero-arg return changes meaning (old `sent(): TOutput[]` was already wrong —
  `sent()` returns recorded raw send args, not `TOutput` values).
- `PortNames<TOutput>` is `never` for single/tuple outputs, so the named overload
  correctly disappears there and `sent("x")` stays a type error — as today.
- No `attachHelpers` runtime change needed; values are already correct once always-array lands.

## Soundness of edge cases (no lying types)
- **Lifecycle holes / null sends** → `| undefined` in `WrappedPort`. `PortTuple` covers only
  *base* ports (matches `baseOutputs` slicing, `io-node.ts:306`); built-in error/complete/
  status slots are reached via the untyped-ish numeric overload.
- **carry/trace extra keys** → `& { [extra: string]: unknown }`: present but `unknown`,
  `output: V` stays precise. (`reset` → `{ output: V }` is a subset, still sound.)
- **custom return key** (`outputReturnProperties`) → not statically knowable; documented gap.
  Those tests already cast (`return-property.test.ts:90,245`).

## No node-declaration migration
Record nodes stay records: 6+ AWS production nodes (`fn-if/iterator/http/code/aws`) +
`RouterNode` rely on `sendToPort("ok", x)` per-port narrowing (`io-node.ts:434-440`).
Forcing record→tuple would **lose** that compile-time safety (`sendToPort(0, wrongType)`
would pass). Bad trade. They keep precise named send + named `sent("ok")`; they gain a
sound union positional `sent()[i][k]`. **Zero author-facing migration.**

## Phased execution (no rework)
- **Phase 1 — land with always-array.** Replace always-array Phase-B placeholder
  `sent(): unknown[][]` with `PortTuple<TOutput>[]`; add `WrappedPort`/`PortTuple`;
  tighten numeric overload `any[]`→`WrappedPort<unknown>[]`. No logic edits.
- **Phase 2 — nrg type tests.** `*.test-d.ts` (`expectTypeOf`) under `tests/core/server/unit/`:
  single → `sent()[0][0].output` is the declared value; tuple → `[0][1].output` is port-1;
  record → `sent()[0]` is `WrappedPort<union>[]` and `sent("success")` precise; single-output-array
  → single branch. Then run existing suite under `tsc --noEmit` (CI typecheck — `feedback_untracked_ci_gap`).
- **Phase 3 — docs.** Show `node.sent()[i][0].output` as the primary single-output assertion;
  `node.sent("port")` for named ports; note the record positional caveat.
- **Phase 4 — consumers.** `sent(name)`/`sent(number)` unchanged and the new `sent()` return is
  superset-precise, so value-level `.toEqual(...)` assertions are unaffected. Audit only the rare
  `const x: T = node.sent()` annotations. Bump as `feat` (`feedback_feat_for_nrg_upgrades_salesforce`).

## Human-decision checkpoints
1. **Couple with always-array** (recommended) — land both as one nrg change, or stack this right after.
2. **`WrappedPort` keys default `output`** (recommended) vs fully unknown. Former gives the requested
   `.output` autocomplete; custom-key minority already casts.
3. **Tighten `sent(number)`** to `WrappedPort<unknown>[]` (recommended) vs leave `unknown[]` — fall back
   if a consumer test regresses. Either way, no `any`.
4. ~~single-output-array vs tuple branch~~ — **RESOLVED** by type-probe (`string[]` → single branch).
5. **Record positional precision via type-generator** — **DEFERRED** (named accessor suffices).

## Net
The generic already carries everything. ~15 lines of harness types (`WrappedPort`, `PortTuple`,
three overloads) make `sent()[i][0].output` precise for single + tuple outputs with zero casts and
zero node migration; record named ports keep precise `sent("name")` and a sound union positionally —
the one place TypeScript genuinely can't recover port order.
