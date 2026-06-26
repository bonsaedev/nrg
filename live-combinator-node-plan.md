# Plan: live Promise-combinator job node (Node-RED runtime)

A **live** nrg node pair that runs downstream sub-flows as "jobs" under a Promise combinator
(`all` / `allSettled` / `race` / `any`), in **parallel** or **sequential (port-index)** order, and
continues the flow with the aggregated result(s). This is the *runtime* design — NOT the compiled
`fn-*` path.

## Why a pair (the core constraint)
Node-RED is fire-and-forget: a node that `send()`s to a branch gets **no return/callback** when the
branch finishes (`io-node.ts` exposes no downstream-completion signal). So branches must physically
route a message **back** to a node we control. The built-in `complete` port can't carry the aggregate
(it's automatic + reserved + fires when `input()` resolves). Solution: a **Dispatcher** + a
**Resolve** node, joined by per-job Promises in a shared in-process registry.

## Locked decisions
- **Dispatcher + Resolve-node pair.**
- **`input()` awaits real per-job deferred Promises**; aggregate produced via `this.send()` out a
  dedicated `done` port. (The auto `complete` port now fires *after* the gather — a free "batch done"
  signal; not the data carrier.)
- **Batch-isolated await** — every batch keyed by `batchId`; concurrent/overlapping triggers are
  always correct regardless of Node-RED's input overlap behavior.
- **One Resolve node + status flag** (`resolve` | `reject`) — maps to `deferred.resolve/.reject`.
- Aggregate via `this.send()` today; "`input()` return auto-sends" is a possible later nrg sugar.

## Mechanism
Shared module-level `registry: Map<batchId, { deferreds: Deferred[]; combinator; mode; createdAt }>`
imported by both nodes (so they must live in the **same package**).

**Dispatcher `input(msg)`** (async):
1. mint `batchId`; create N deferreds (`{promise,resolve,reject}`), one per job port; store in registry.
2. **parallel:** `sendToPort(k, jobMsg(k))` for all k (each msg stamped `{batchId, index:k}`); then
   `const out = await Promise[combinator](deferreds.map(d=>d.promise))`.
   **sequential:** loop `for k: sendToPort(k, jobMsg(k)); result[k] = await deferreds[k].promise` (so
   job k+1 dispatches only after k settles — natural short-circuit for `all`).
3. race the gather against a **timeout** (`Promise.race([gather, timer])`).
4. `sendToPort("done", aggregate)` on success; on combinator rejection / timeout, route to the error port.
5. `finally`: delete `registry[batchId]`.

**Resolve node `input(msg)`**: read `{batchId, index}` + status flag; `registry[batchId].deferreds[index]`
`.resolve(value)` or `.reject(reason)`; return immediately. (A deferred settles once → duplicate
returns from a fan-out branch are harmless no-ops, for free.)

## Ports
**Dispatcher:** `job0 … jobN-1` (dispatch), **`done`** (aggregate continuation), built-in **error**
(combinator reject / timeout), built-in **complete** (auto; fires after gather — leave unwired or use
as a "done" signal). N is author-configured (dynamic outputs already supported).
**Resolve:** single input; config: status (`resolve`/`reject`), and where to read `batchId`/`index`/value
(defaults from the stamped envelope). No data output needed (it just settles a Promise).

## Combinator × mode → aggregate
Branch values `T0…T_{N-1}`; positional by **job-port index**.

| combinator | done payload | error when |
|---|---|---|
| `all` | `[T0,…,T_{N-1}]` | first reject (parallel: fail-fast; sequential: stops dispatching) |
| `allSettled` | `[{status:"fulfilled";value}\|{status:"rejected";reason}, …]` | never (records rejects) |
| `race` | first settled value | first settle is a reject |
| `any` | first fulfilled value | all reject → `AggregateError` |

`race`/`any` + sequential = degenerate (first job decides) → config diagnostic.

## Correlation, state, edge cases
- **Correlation:** `{batchId,index}` stamped on each job msg under a reserved envelope key (e.g.
  `msg.__nrgJobs`); carry context-mode preserves it through nrg branches. Lossy/non-nrg branch nodes
  that drop unknown keys break it → documented constraint + a validation target.
- **Re-entrancy:** `batchId` isolation; deferreds settle once.
- **Timeout (mandatory):** a never-signaling branch would block that dispatcher forever; `timeoutMs`
  config; on expiry settle per combinator (`all`→error, `allSettled`→fill rejections, `race`/`any`→error)
  and clean up. Use `this.setTimeout` (Delay precedent).
- **Branch errors:** wire the branch's error tail to the Resolve node with status `reject` (or the
  Resolve node reads `msg.error`). Feeds combinator semantics.
- **Single-process only:** in-memory registry can't span replicas and is lost on restart — fine for
  typical Node-RED; a context-store variant would add durability at the cost of the clean Promise model.
- **Duplicate returns** (branch fan-out): harmless — Promise settles once.

## Phased plan
1. **Decisions (Phase 0):** where the pair lives (package); envelope key; default `timeoutMs`;
   confirm Node-RED input-overlap behavior (correctness holds either way via batchId).
2. **Dispatcher + Resolve + registry (MVP):** parallel mode; `all`/`allSettled`; timeout + cleanup;
   error port. Integration tests via the Recorder harness (concurrent batches, errors, timeout, duplicates).
3. **race/any + sequential mode** (with degenerate-pair diagnostics + sequential short-circuit).
4. **Productization:** typed `done` output (combinator-derived from job-port types); editor pairing of
   Dispatcher↔Resolve + validation that every job tail (success *and* error) reaches the Resolve node;
   warn on envelope-dropping branch nodes.
5. **(Optional)** `input()`-return-auto-sends sugar in nrg; context-store durable variant.

## Open checkpoints
- Package/home for the two nodes (same package, for the shared registry).
- Envelope key name + whether `batchId`/`index` are user-overridable.
- Default `timeoutMs` and timeout-settlement policy per combinator.
- Whether to add the input-return sugar / durable (context-store) variant later.
