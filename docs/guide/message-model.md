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

## Context modes {#context-modes}

How each output port builds its outgoing record is the port's **context mode**,
resolved per port from config:

- **merge** (default) — `{ ...incoming, ...additions }`. The record accumulates.
  A re-entered node overwrites its *own* fields, so the record is bounded by the
  distinct nodes on a path — never by loop iterations.
- **reset** — `{ ...additions }`. A fresh record, for emissions that begin a new
  logical signal: a source firing, a per-item dispatch, a loop lap that should
  start clean. A reset port's output is exactly its declared `T` regardless of
  what came in — which also *re-anchors the types* after an untyped upstream
  (e.g. a core `inject`).

The flow author can pick a mode for **any** port in the editor's Outputs table;
declaring `outputContextModes` only seeds a port's starting value:

```typescript
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // port 0's dropdown starts on `reset`; every other port starts on `merge`.
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "reset" },
    }),
  },
  { $id: "my-node:configs" },
);
```

A legacy `passthrough` value stored in an old flow resolves to `merge`.

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
every hop and mode** (a source node mints a fresh one via
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
hidden — and a `reset` port after such a boundary restores full checking, since
its output type doesn't depend on what came in. Feedback loops are supported:
the checker anchors a loop's join at its declared reads (the loop invariant) and
verifies every lap re-satisfies it.
