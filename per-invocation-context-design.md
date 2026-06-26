# Design: per-invocation input context (why `AsyncLocalStorage`)

**Status:** implemented — `817e2c3 fix(runtime): scope per-input context to each input() call` (ships in nrg 0.25.1).
**Scope:** `packages/runtime/src/server/nodes/io-node.ts`.
**Tests:** `tests/core/server/unit/nodes/concurrent-input-race.test.ts`, `tests/core/server/unit/nodes/return-property.test.ts`.

## TL;DR

`IONode` lets authors emit with `this.send(value)` and auto-wraps the value with the
incoming message's context (the "carry" convention). To wrap, `this.send` must know
*"which input am I inside."* The original code stored that on instance fields
(`#currentInputMsg`, `#send`). Because Node-RED never serializes async input handlers,
two `input()` calls can be in flight at once, and the second clobbered the first's
fields — so the first input emitted with the second's context.

We fixed it by holding the per-invocation context in an `AsyncLocalStorage` store
scoped to each `input()` call, and **deleted both shared fields**. The `this.send`
author API is unchanged; a deferred send keeps the context of the input that scheduled
it; and there is no shared per-invocation state left to race on.

We considered ~9 alternatives. The only technically cleaner one — an explicit
`input(msg, ctx)` parameter (Node-RED's own model) — is ruled out because it's a hard
breaking change with no backward-compatible shim (`this.send` kept for compat has
nothing but instance state to read, which *reintroduces the race*). For a bug fix that
must not break the public API, `AsyncLocalStorage` is the right call, and it matches
where the broader industry has landed for per-unit-of-work context (Python
`contextvars`, Java Scoped Values, OpenTelemetry — all the same shape).

---

## 1. The problem

### 1.1 The ergonomic that creates the coupling

nrg's emission API is value-first: `this.send(value)` / `this.sendToPort(port, value)`,
where `value` is **only the payload**, and the framework wraps it with the incoming
message's context — `{ ...inputMsg, output: value }` in the default `carry` mode
(also `trace` and `reset`). That wrapping is a real feature: provenance/context flows
through a flow without every node re-implementing it.

But to wrap, `this.send` has to recover *this invocation's* `inputMsg`. The original
implementation stashed it on the node instance at input start and read it back at send
time:

```ts
// original (buggy) shape
this.#currentInputMsg = msg;          // set per input()
// ... later, inside this.send():
const base = this.#currentInputMsg;   // read back
return { ...base, output: value };
```

Same story for the delivery callback (`this.#send`).

### 1.2 Node-RED does not serialize async input on `done()`

A common assumption (we held it too) is that the next message waits for `done()`. It
does not. Verified against the installed Node-RED 5.0.0 source
(`@node-red/runtime/lib/nodes/`):

- The input handler's returned promise is **ignored** — `Node.js` `_emitInput` calls
  `node._inputCallback(arg, send, done)` and discards the return value
  (`Node.js:211-221`). It returns the instant the handler hits its first `await`.
- `emit('input')` / `receive()` are fire-and-forget (`Node.js:187-194`, `499-507`).
- Flow delivery is `setImmediate`, fire-and-forget (`Flow.js:821-844`).
- `done()` / `_complete` is **completion tracking only** — metrics, the `onComplete`
  hook, error routing, and feeding "Complete" nodes (`Node.js:132-147`,
  `Flow.js:697-714`). It never releases a held input. **There is no input queue.**

So if `input()` awaits (any async node — HTTP, DB, LLM, a timer), a second message can
enter `input()` before the first finishes.

### 1.3 The race

```
input(A): #currentInputMsg = A;  await work…            (suspended)
input(B):                  #currentInputMsg = B;  await work…   (clobbers A's base)
input(A): …resumes → this.send(x) → wraps over B   ← A emits with B's context
```

Proven in `concurrent-input-race.test.ts`: two **non-awaited** `receive()` calls (which
faithfully model Node-RED's non-awaiting delivery), parked on a shared gate; pre-fix the
first input's emission carried the second's id.

---

## 2. Why Node-RED itself never had this bug

Node-RED is not missing a fix — its API is shaped so the bug can't arise.

**It keeps per-message data in arguments, never on the node.** The contract is
`node.on('input', (msg, send, done) => …)`. `msg` and `send` are **parameters**: each
invocation gets its own, living in that call's stack frame / closure. Two overlapping
invocations have two independent `msg` bindings — there is nothing shared to overwrite.

**The author carries context by forwarding the message.** Node-RED's `node.send(msg)`
takes the **complete outgoing message** as an argument; the runtime never reconstructs
"the current input." You receive `msg`, mutate it, and send it.

**They designed for overlap on purpose.** The `send`/`done` parameters were added in
Node-RED 1.0 (2019) specifically for async nodes and completion tracking — the model
*assumes* overlapping async handlers and isolates them via parameters.

> Nuance worth recording: in Node-RED 5 the per-message `send` callback is a *stateless*
> `function(){ node.send.apply(node, arguments) }` (`Node.js:214-218`) — identical for
> every message. So for current Node-RED, the only state that genuinely raced in nrg is
> `inputMsg`; we still capture `send` in the store as cheap forward-compat insurance
> against a future Node-RED that binds per-message state.

**An individual node author *can* reproduce the same bug** by writing
`this.lastMsg = msg` and reading it from a timer — but that's a node-author footgun, and
core never does it. nrg made it framework-wide by baking the read-back into the base
class. The fix puts the per-call data back where Node-RED keeps it — in call scope —
just via async-context instead of an explicit parameter.

**The framing in one line:** per-invocation data can live on the call stack/closure
(Node-RED: isolated, but the author must thread it), on the instance (old nrg: racy), or
in async-context storage (fixed nrg: isolated, framework threads it implicitly). ALS is
"the async generalization of a function parameter."

---

## 3. The fix

A single module-level store, scoped per `input()` call:

```ts
import { AsyncLocalStorage } from "node:async_hooks";

interface InputInvocation { inputMsg: unknown; send: (msg: any) => void; }
const inputInvocation = new AsyncLocalStorage<InputInvocation>();

// #input:
return await inputInvocation.run({ inputMsg: msg, send }, () =>
  Promise.resolve(this.input(msg)),
);

// #wrapOutgoing:  base = inputInvocation.getStore()?.inputMsg ?? {}
// #deliver:       send = inputInvocation.getStore()?.send  ?? node.send
```

Properties:

- **Author API unchanged.** `this.send(value)` / `this.sendToPort(port, value)` work
  exactly as before; node authors notice nothing.
- **Correct under interleaving.** ALS isolates by *logical async chain*, not by call
  nesting — so two inputs awaiting at the same time read their own store.
- **Detached continuations keep their scheduler's context.** The store propagates across
  `await`, `.then`, `queueMicrotask`, and timers, so a deferred
  `gate.then(() => this.send(x))` scheduled inside `input(A)` carries **A's** context
  even after A's `input()` returned — the framework author's confirmed desired semantic
  (`return-property.test.ts` asserts exactly this).
- **No shared per-invocation state.** Both `#currentInputMsg` and `#send` were removed;
  there is no instance field left to clobber.
- **Clean out-of-input fallback.** `getStore()` is `undefined` only for a send made
  entirely outside any `input()` (e.g. a timer set up in `created()`): it carries no
  inherited context and delivers via `node.send`.

### 3.1 The store is held by reference — nothing is cloned or serialized

`AsyncLocalStorage` is in-process context propagation, **not** message passing. `run()`
holds the store object you pass it **by reference**, and `getStore()` returns the *same*
object — there is no `structuredClone`, no JSON round-trip, no marshalling. So:

- the **`send` callback is preserved as the exact same function** —
  `getStore().send === send`; `#deliver` calls the real function, never a copy;
- the **`inputMsg` is the same object reference** (`getStore().inputMsg === msg`) —
  class instances, closures, `Buffer`s, circular refs, anything on it survives intact;
- the per-call `{ inputMsg, send }` wrapper is a fresh literal per `input()`, but its
  fields are references, so nothing inside is lost.

This is categorically different from boundaries that *do* drop functions — `postMessage`,
`structuredClone`, a JSON cache, a worker thread. ALS crosses none of those; it only
follows the async-execution chain in the same process.

The one deep-copy in the path is **Node-RED's clone-on-fanout** of the *message* when a
single send goes to multiple wires (`RED.util.cloneMessage`), which can drop functions
placed on a `msg`. That is pre-existing Node-RED message-passing behavior, unrelated to
this fix, and it never touches the `send` callback (the callback lives in the ALS store,
never on a message).

> Separate, unrelated failure mode — *losing the context association* (not the
> references): if an author detaches a callback into a structure that severs the async
> chain (a module-level pool drained by an unrelated tick), `getStore()` can return
> `undefined`. That's "which store is active got lost," never "the store's contents got
> corrupted." When a store is returned, it is whole. See §7.

---

## 4. Alternatives considered

| # | Approach | Keeps `this.send`? | Perf | Handles detached sends? | Verdict |
|---|---|---|---|---|---|
| **0** | **`AsyncLocalStorage` (chosen)** | ✅ unchanged | small async-hooks cost | ✅ native | **chosen** |
| 1 | Explicit `input(msg, ctx)` + `ctx.send` | ❌ breaking | **best** (closure) | ✅ best (lexical) | runner-up; ruled out — see below |
| 2 | Require full message `this.send({...msg, output})` | ❌ breaking | n/a | only if author threads `msg` | reject — destroys carry/trace/reset; relocates bug into user code |
| 3 | `input()` returns the value(s) | partial (additive only) | free | ❌ **cannot express them** | useful sugar, not a fix (already used for the complete port) |
| 4 | Serialize / queue inputs (no overlap) | ✅ | **throughput collapse** | ❌ **and doesn't fix detached** | reject — wrong semantics, head-of-line blocking, incomplete |
| 5 | Push/pop a context **stack** on the instance | ✅ | cheap | ❌ | reject — the original bug re-skinned (async interleave ≠ LIFO nesting) |
| 6 | `Map`/`WeakMap` keyed by `msg` | ✅ | cheap | ❌ | reject — solves identity, not ambient lookup; `this.send(value)` has no key |
| 7 | Reassign `this.send` to a per-call closure | ✅ syntactically | closure alloc + deopt | ❌ | reject — literally what the buggy `#send` did, on a public name |
| 8 | `cls-hooked` / `zone.js` | ✅ | slower (cls) / global patch (zone) | ✅ | reject — strictly dominated reimplementations of ALS; add a dep / global risk |
| 9 | Hybrid: ALS + explicit `this.context()` escape hatch | ✅ | ALS + occasional read | ✅ + manual re-thread | **future hedge, YAGNI** — additive; add only if a real ALS blind spot appears |

**The decisive trade-off (why not #1, the explicit `ctx`).** On raw merits #1 is
*cleaner* than ALS: no async-hooks overhead, no action-at-a-distance, the context is a
value you can log. It's also exactly Node-RED's own model. It loses on one hard
constraint: **a bug fix must not break the public API.** `this.send`/`sendToPort` are in
the public `IIONode` interface, the `defineIONode` bound-`this` contract, every example,
and dozens of existing nodes (salesforce, file-storage, claude-agent, …). And there is
**no backward-compatible shim** — a `this.send` kept for compatibility has nothing but
instance state to read, which *is the race*. So #1 means a hard, repo-wide breaking
migration with no graceful path. If nrg were greenfield, #1 would be the stronger
design; it is not greenfield, so ALS wins.

Everything else (5, 7) is the original bug in disguise, (6) doesn't provide ambient
lookup, (4) changes runtime semantics catastrophically *and still doesn't fix detached
sends*, (2)/(3) can't express the feature set, and (8) is a dependency-adding
reimplementation of what `node:async_hooks` already gives us for free.

---

## 5. Why `AsyncLocalStorage` specifically (prior art)

Every system that processes concurrent, interleaved units of work faces the same
question: how does code deep in the chain reach request-/task-scoped data set at the top
— without threading a parameter through every call? There are two answers, and the
industry oscillates between them.

| Ecosystem | Mechanism | Camp |
|---|---|---|
| Node.js | `AsyncLocalStorage` (stable v16.4.0; AsyncContextFrame default in v24) | **implicit** |
| Python | `contextvars` — PEP 567, Final in 3.7 (per-`asyncio.Task` context) | **implicit** |
| Java | Scoped Values — JEP 506, final in JDK 25 (immutable, scope-bound) | **implicit (scoped)** |
| OpenTelemetry (Node) | `AsyncLocalStorageContextManager` (deprecated the async-hooks one) | **implicit (ALS)** |
| React | Context (solves prop-drilling; "Service Locator" hidden-dep costs) | **implicit** |
| Angular | `zone.js` global monkey-patch → **being removed** (zoneless default v21+) | implicit (cautionary) |
| Go | `context.Context` — explicit first parameter, by design | **explicit** |

Three points carry the decision:

1. **ALS is the standard, stable, officially-endorsed Node mechanism.** Node's own docs
   ship the canonical per-request-ID example using `als.run(...)` + `getStore()`. Its
   historical performance objection — issue
   [#34493](https://github.com/nodejs/node/issues/34493) reported ~97% degradation in a
   *pathological* await-heavy microbenchmark (Node 12, 2020), typically <10% in practice
   — was largely resolved by **AsyncContextFrame**, made the default in **Node 24**
   ([PR #55552](https://github.com/nodejs/node/pull/55552)). (nrg's floor is Node 22,
   which uses the classic implementation; the overhead is still in the noise next to the
   I/O these async nodes perform.)

2. **OpenTelemetry is direct precedent.** The industry-standard tracer propagates
   per-request context across async boundaries in Node via
   [`AsyncLocalStorageContextManager`](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts),
   having **deprecated** the older async-hooks manager. The experts converged on exactly
   this tool for exactly this job.

3. **The honest counter-argument is Go,** which deliberately
   [rejected goroutine-local storage](https://github.com/golang/go/issues/21355) in
   favor of an explicit `context.Context` parameter — the canonical case *against*
   implicit context (action-at-a-distance, hidden dependencies). It doesn't bind us
   because: (a) Go made the call at language-design time with a uniform convention
   enforced from day one; (b) Go's argument is strongest for *cancellation/deadlines*
   (which want explicit lifetime control) and for data *core to a function's contract* —
   ours is read-only per-message correlation data flowing through framework-controlled
   intermediaries we explicitly do **not** want every node author to thread by hand; and
   (c) we are retrofitting an existing implicit API, which is precisely the situation
   where implicit context is the only practical option.

**The consensus shape.** The cross-ecosystem lesson is *not* "implicit good / explicit
bad." It's that implicit context must be **scoped and bound to the logical unit of
work** (ALS `run()`, Java `ScopedValue.where().run()`, Python per-Task `Context`) — not
a freely-mutable, unbounded, shared slot (Java's `ThreadLocal` anti-pattern, or — in our
case — a mutable field on a shared node instance, which is exactly what caused the race).
The fix replaces a shared mutable slot with a scoped, per-unit-of-work store. That is the
shape the whole industry has converged on.

---

## 6. The general lesson (for contributors)

**Anything you stash on `this` and read back across an `await` will race under
concurrency.** Per-call state belongs in a parameter, a closure, or an async-context
store — never a shared instance field. nrg chose to hide the parameter behind `this.send`
for ergonomics; `AsyncLocalStorage` is what lets that ergonomic stay correct.

## 7. Accepted trade-offs / caveats

- **Overhead:** measurable async-hooks cost per message; immaterial next to node I/O, and
  default-optimized on Node 24+ (AsyncContextFrame).
- **Action-at-a-distance:** ALS is "magic" by nature. Mitigated here because it is
  entirely framework-internal — authors only ever see `this.send`; no node code touches
  the store.
- **One real blind spot:** ALS can lose context if a callback is detached into a
  manually-pooled structure that opaquely severs the async-resource chain (a module-level
  work queue drained by an unrelated tick). No current node does this. If one ever does,
  the additive hedge is alternative #9 — expose the frame via `this.context()` so the
  author can capture and re-thread it explicitly. **YAGNI until a real case appears.**

## 8. Follow-up

Once 0.25.1 is released, the `@bonsae/node-red-claude` agent node can drop its manual
`correlationId`-capture workaround — it was hand-rolling exactly this per-invocation
isolation.

---

### References

- Node.js — [Asynchronous context tracking](https://nodejs.org/api/async_context.html) ·
  [async_hooks](https://nodejs.org/api/async_hooks.html) ·
  [PR #55552 — AsyncContextFrame default in v24](https://github.com/nodejs/node/pull/55552) ·
  [Issue #34493 — perf penalty](https://github.com/nodejs/node/issues/34493)
- Go — [Go blog: Context (2014-07-29)](https://go.dev/blog/context) ·
  [golang/go#21355 — GLS proposal rejected](https://github.com/golang/go/issues/21355)
- Python — [PEP 567 — Context Variables (Final, 3.7)](https://peps.python.org/pep-0567/)
- Java — [JEP 506 — Scoped Values (final, JDK 25)](https://openjdk.org/jeps/506)
- React/OTel — [OTel JS Context](https://opentelemetry.io/docs/languages/js/context/) ·
  [AsyncLocalStorageContextManager source](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts)
- Angular — [Zoneless guide](https://angular.dev/guide/zoneless)
- Node-RED 5.0.0 runtime source: `@node-red/runtime/lib/nodes/Node.js`, `lib/flows/Flow.js`
