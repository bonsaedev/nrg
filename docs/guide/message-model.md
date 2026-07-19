# The Message Model

This is the mental model behind every nrg node: the message is the **flow's
shared, accumulating record**. Each node reads the fields it needs and merges in
the fields it produces — like functions contributing to one shared object:

```typescript
function main() {
  let msg = {};
  msg = a(msg); // adds { userId }
  msg = b(msg); // adds { record }   — a's userId still there
  msg = c(msg); // reads userId AND record, adds { summary }
}
```

A flow is that program assembled visually. Nothing a node contributes is ever
silently lost across hops, every field is typed, and the
[wire check](#the-wire-check) verifies the whole chain.

## Sends merge named fields

`this.send("out", additions)` takes an **object of named fields** and merges it
onto the incoming record:

```typescript
// incoming: { order: {…}, _msgid }
this.send("out", { customer });
// outgoing: { order: {…}, customer: {…}, _msgid }   (+ provenance, see below)
```

- **Additions are named.** A scalar result gets a name: `send("out", { count })`.
  Sending a bare scalar or array throws — loudly, at the send.
- **Everything upstream flows through.** Your node only declares what it *reads*
  (the input port's `T`) and what it *adds* (each output port's `T`) — carrying
  the rest is the framework's job.
- **Same name = deliberate enrichment.** Writing a field that already exists
  replaces it (last writer wins); if the types are incompatible, the wire check
  flags it.
- `send("out")` with no value forwards the record unchanged.

To interoperate with Node-RED core nodes (which key on `msg.payload`,
`msg.topic`, …), give your field the name the core node expects — or map it with
a `change`/`set` node at the boundary.

## Input is read at the root

A node's `Input` type describes the fields it consumes **off the record**, read
at the top level:

```typescript
type MyInput = Input<Port<{ order: Order; customer: Customer }>>;

async input(msg: MyInput) {
  const who = msg.customer.name; // ✅ root reads — even if `customer` was
  // produced three nodes upstream
}
```

Declare only what you actually read. The wire check then guarantees a node
*somewhere upstream* produced each field — wiring your node where a required
field doesn't exist is a type error on that wire, before deploy.

Your `Input` type is a declaration of **what you read from the shared record — not
a filter on what reaches the node.** The whole accumulating message always arrives
at `input()`; the type just names and types the fields you touch, so the wire check
can prove they exist upstream and TypeScript can type them in the handler. Fields
you don't declare still ride along on `msg` — you simply haven't typed them.

Runtime **data validation** is a separate, opt-in concern. The `Input` type is
compile-time only; to *reject* bad messages at runtime, turn on the input's
**Validate Data** toggle and give it an `inputSchema`. That schema validates the
**whole incoming message** and is independent of the `Input` type — see
[Input Data Validation](./schemas#input-schema).

## Provenance: `msg[Meta]`

The framework stamps every emission with its producer — node id, type, name,
and the port (built-in lifecycle ports stamp their real slot, with the built-in
name as `portName`). Read it through the `Meta` accessor, typed and read-only:

```typescript
import { Meta } from "@bonsae/nrg/server";

async input(msg: MyInput) {
  const src = msg[Meta].source; // MessageSource | undefined
  // undefined = the upstream producer wasn't an nrg node
}
```

Like `msg[Channels]`, the accessor is symbol-keyed — it can never collide with
data fields and never shows up in enumeration. (Under the hood the data rides a
clone-safe `_meta` root key, because Node-RED's fan-out clone drops symbol
properties; that carrier is framework-internal, exactly like `_msgid`.)

## Lineage: `_msgid`

Every message carries Node-RED's `_msgid` lineage id. nrg **preserves it across
every hop** (a source node mints a fresh one via
`RED.util.generateId()`), so the message-flow debugger, Catch/Complete grouping,
and any `_msgid`-based correlation keep working. `_msgid` is framework-managed —
it's deliberately not on your `Input` type, and you never set it by hand.

## Source nodes and `transactionId`

A **source/trigger node** has no input port (its `Input` generic is `never`, so
its topology reports `inputs === 0`) and emits on its own — from `created()`, a
timer, or an external event. When it sends, the framework mints the message's
`_msgid` and stamps it, read-only, onto the **protected** channel as
`transactionId`:

```typescript
// in any downstream node:
async input(msg: MyInput) {
  const txn = msg[Channels].protected.transactionId; // the origin trigger's id
}
```

Because every downstream node inherits the same `_msgid`, `transactionId` is
readable across the whole chain to correlate all work back to that one trigger
firing — off the wire, immutable (any attempt to overwrite or delete it throws),
and independent of the wire `_msgid` a flow author could otherwise change. See
[Message Channels](./message-channels#transactionid) for the channel it rides on.

## Built-in port shapes

The optional error / complete / status ports follow the **same merge rule** as
data ports — a lifecycle wire keeps the full context:

- **error** — the processed record plus an `error` block
  (`{ …record, error: { name, message, stack? } }`). A handler reads `msg.error`
  *and* the record that failed, side by side. An enabled error port is the
  **sole** error handler — the error travels its wire and does *not* also fire
  Node-RED `catch` nodes (those are the fallback only for a node with no error
  port).
- **complete** — the processed record plus `input()`'s **returned fields**
  (`return { count }` → `msg.count` on the complete wire). The return value must
  be a plain object — or `void`, which contributes nothing: arrival on the wire
  is itself the signal.
- **status** — the record (when a message was being processed) plus `status`.

See [Lifecycle Output Ports](./creating-a-node#lifecycle-output-ports) for how to
enable and use them.

## The wire check {#the-wire-check}

Because outputs merge onto their inputs, the accumulated record's type composes
across the whole flow — and nrg verifies it. In `nrg dev`, every deploy
compiles the flow graph into a TypeScript program (one call per node, wires as
arguments) and type-checks it:

- per-wire `✔` / `✖` verdicts print in the dev terminal,
- failing wires paint **red (dashed)** in the editor canvas, with one
  notification listing them,
- the exact tsc message says which field is missing or mismatched, at exactly
  the wire that needs it.

Core (non-nrg) nodes are an *unchecked boundary* (`any`) — reported, never
hidden — so a core node upstream leaves the rest of that chain unchecked; a flow
is fully checked when it starts from a typed nrg source node. Feedback loops are
supported: the checker anchors a loop's join at its declared reads (the loop
invariant) and verifies every lap re-satisfies it.

## Reading a flow: the three exits

> **Reading a wire = reading the accumulated record at that point** — every field
> guaranteed by the nodes upstream of it. Because outputs merge onto inputs, the
> type **grows** as you follow a wire downstream.

A node has three ways to *advance* the signal (each carries the accumulated
record), plus logging, which does not ride a wire at all:

| Outcome | Use | On a wire? |
|---|---|---|
| Forward / route the message | `send("out", …)` | yes — `{ …record, …adds }` |
| Terminal success + result | `return { … }` → **complete** | yes — `{ …record, …returned }` |
| Terminal / unexpected failure | `throw` → **error** | yes — `{ …record, error }` |
| Expected, per-item failure | a **data port**, e.g. `send("rejected", …)` | yes — typed data |
| Diagnostics / observability | `this.warn(…)` / `this.error(…)` → **log** | no |

**Growth + error context.** Follow the out-rail and the type accumulates; each
error wire carries the record *as it entered that node* plus `error`:

```
[orders-in] ─ out ▸ {orderId}
[load]      ─ out ▸ {orderId, order}            ─ error ▸ {orderId, error}         ▶ [on-load-fail]
[charge]    ─ out ▸ {orderId, order, chargeId}  ─ error ▸ {orderId, order, error}  ▶ [on-charge-fail]
[fulfill]   ─ out ▸ {orderId, order, chargeId, shipmentId} ▶ [done]
```

`load` threw *before* adding `order`, so its error wire is `{orderId, error}`;
`charge` got further, so its error wire also carries `order`. A handler reads the
real failed context, not just a message string.

**Shared handlers read only the common fields.** Wire several error ports into one
handler and Node-RED delivers one message per firing — so the wire's type is what
*all* sources share:

```
[load]  ─ error ▸ {orderId, error}        ┐
[charge]─ error ▸ {orderId, order, error} ┴▶ [notify]   reads {orderId, error}  (not order)
```

**Expected failures are data, not errors.** Model a real failure *outcome* as a
typed data port; reserve `throw`/error for the unexpected. A batch node's three
exits each mean exactly one thing:

```
[process] ─ error ▸ {items, error} ▶ [page-oncall]              (throw: whole firing died — at most once)
          └ rejected ▸ {items, index, reason} ▶ [dead-letter]   (data port: one item — fires N times)
          └ complete ▸ {items, results} ▶ [report]              (return: after every item settles)
```

**Recovery loops work because error carries the signal.** An error handler has the
full failed record, so it can clear the error (set the field to `undefined`) and
send it back:

```
        ┌──────────── back-edge (backoff's one output) ──────────────┐
        │  {orderId, order, error: undefined}   (charge reads {order} ✓)
        ▼                                                            │
[charge] ─ out ▸ {orderId, order, chargeId} ▶ [fulfill]             │
   └──── error ▸ {orderId, order, error} ▶ [backoff] ───────────────┘
```

The checker verifies the back-edge against `charge`'s declared reads (the loop
invariant), so a recovery loop is type-checked like any other path.
