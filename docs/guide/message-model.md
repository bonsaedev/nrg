# The Message Model

This is the mental model behind every nrg node: how a message arrives, how your
result leaves, and what the flow author can change in between. Get this right and
the rest of the framework falls into place.

## The output envelope

`this.send("out", value)` treats `value` as the **result** — never as the whole
outgoing message. The framework wraps it into a consistent envelope:

```typescript
this.send("out", result);
// outgoing: { output: result, source: { id, type, name, port }, input: <incoming> }
```

- **`output`** — your result, at the port's return key (`output` by default; see
  [Custom return keys](#overriding-the-return-key)).
- **`source`** — who produced it: `{ id, type, name, port, portName? }`. It rides
  the **root** (never inside `output`) so it survives Node-RED's fan-out clone.
- **`input`** — the message this node processed, kept so the prior result stays
  recoverable as `msg.input.output`. Whether it's attached is the
  [context mode](#context-modes).

A node therefore sets **only** its result — it never writes arbitrary top-level
message properties. Multi-value results go under one object:

```typescript
this.send("out", { records, totalSize, done }); // msg.output = { records, totalSize, done }
```

To interoperate with Node-RED core nodes (which key on `msg.payload`, `msg.topic`,
…), map `output` onto the property they expect with a `change`/`set` node at the
boundary.

## Input is read at the root

The flip side of the envelope: a node's `Input` type describes the **root** of the
message it receives. Read `msg.<field>` at the top level — **not** `msg.output.<field>`.

```typescript
type MyInput = Input<Port<{ payload: string }>>;

async input(msg: MyInput) {
  const text = msg.payload; // ✅ read at the root
  // NOT msg.output.payload
}
```

When two nrg nodes are wired together, the upstream node emits `{ output, source,
input }`, so the downstream node receives that whole object as its root. If your
node expects the upstream **result** at the root instead, rebase it with
[Input root](#input-root).

## Context modes {#context-modes}

`send()` takes no mode argument — how each output carries the incoming message is
resolved **per port** from config, falling back to `passthrough`. The flow author
can pick a mode for **any** port in the editor's Outputs table; declaring
`outputContextModes` only lets the node **author** change a port's starting value:

```typescript
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // port 0's dropdown starts on `reset` instead of `passthrough`; every other
    // port starts on `passthrough`. All ports stay editable by the flow author.
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "reset" },
    }),
  },
  { $id: "my-node:configs" },
);
```

There are **two** modes — the dial is simply *whether the incoming message is
attached under `input`*:

- **passthrough** (default) — attach the immediately-previous message under
  `input`, with **its own `input` stripped** so the chain is always exactly one
  hop deep and never grows (`msg.input.output` is the previous result). Loop-safe.
- **reset** — attach nothing: the outgoing message is just the result plus
  `source`, with no `input` frame. Use it for source nodes that start fresh.

The mode only matters when there *is* an incoming message: a send with none — from
a source node, or from outside any `input()` call — has no prior message to attach,
so `input` is omitted either way.

The **Context Mode** column is always shown in the Outputs table for any node with
output ports, and every port's dropdown is editable. A port with a declared
default is seeded to that value; the rest seed to `passthrough`. Named-port sends
(`this.send("name", value)`) resolve the same per-port mode by index.

## Custom return keys {#overriding-the-return-key}

Every output port's return key is `"output"`. The editor's Outputs table always
shows an editable **Return Property** column (the framework injects
`outputReturnProperties` into every IONode), so flow authors can rename each
port's key. Declaring it in your schema lets the **author** change the default
**per port**:

```typescript
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // port 0 defaults to `result`; every other port falls back to `output`
    outputReturnProperties: SchemaType.OutputReturnProperties({
      default: { 0: "result" },
    }),
  },
  { $id: "my-node:configs" },
);
```

- Keyed by output port index; a missing/empty entry falls back to `"output"`.
- Keys must be valid JavaScript identifiers (and can't be a framework key such as
  `input`, `source`, or `_msgid`) — validated in the editor and again at node
  construction.
- Named-port sends resolve the same per-port key by index.

## Input root {#input-root}

By default `input()` reads the whole incoming message. A node can rebase what it
reads with the **`inputRoot`** config field — an editable control on every IONode
(the **Input Root** field in the Input settings). The default (`""`, or `"."` /
`"msg"`) means the whole message. Any other property (e.g. `"output"`) rebuilds the
message rooted there **before** `input()` runs:

```
msg = { ...msg[inputRoot], _msgid }
```

So setting a downstream node's input root to `output` lets it read an upstream nrg
node's result directly at the root — no `set` node needed to lift the fields:

```typescript
// upstream emits { output: { value: 42 }, source, input, _msgid }
// with inputRoot = "output", this node's input() sees { value: 42, _msgid }
async input(msg: MyInput) {
  return msg.value; // 42
}
```

This is **lossy by design and never automatic**: everything outside the chosen
property (including `source` and the prior `input` frame) is dropped — only
`_msgid` is carried across, so the lineage id and off-the-wire
[channels](./message-channels) survive. Use it deliberately. TypedInput `msg.`
expressions in the node's config resolve against the rebased message too, so
there's one coordinate system.

## Lineage: `_msgid`

Every message carries Node-RED's `_msgid` lineage id. nrg **preserves it across
every hop and mode** (a source node mints a fresh one via `RED.util.generateId()`),
so the message-flow debugger, Catch/Complete grouping, and any `_msgid`-based
correlation keep working. `_msgid` is framework-managed — it's deliberately not on
your `Input` type, and you never set it by hand.

## Source nodes and `transactionId`

A **source/trigger node** has no input port (its `Input` generic is `never`, so its
topology reports `inputs === 0`) and emits on its own — from `created()`, a timer,
or an external event. When it sends, the framework mints the message's `_msgid`
and stamps it, read-only, onto the **protected** channel as `transactionId`:

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

The optional error / complete / status ports follow the same "payload in its own
block, `source` + `input` at the root" shape as data ports:

- **error** — `{ error: { name, message, stack? }, source, input, _msgid }`. A
  Catch node reads `msg.error`. An enabled error port is the **sole** error
  handler — the error travels its wire and does *not* also fire Node-RED `catch`
  nodes (those are the fallback only for a node with no error port).
- **complete** — `{ complete?: <input() return value>, source, input, _msgid }`. A
  `void` return omits the `complete` key (arrival on the wire is the signal).
- **status** — `{ status, source }`, a raw notification.

See [Lifecycle Output Ports](./creating-a-node#lifecycle-output-ports) for how to
enable and use them.
