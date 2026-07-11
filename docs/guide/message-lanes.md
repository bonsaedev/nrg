# Message Lanes

Some data a node produces can't travel on the wire. A live database connection, an
open HTTP `res`, a streaming handle, an OpenTelemetry span, an `AbortController` — these
are **live objects**, not JSON. Other data *could* be serialized but must stay **hidden
from the flow author**: a decrypted access token, a signed correlation id.

Message lanes give every message two channels that ride *alongside* it without being
*on* it:

```typescript
this.send(publicMsg, protectedData, privateData);

// a downstream node reads them back off its incoming message:
msg.protected.span;   // visible to a node from ANY package
msg.private.conn;     // visible to nodes in YOUR package only
delete msg.private.conn; // release it when you're done
```

The lane data never rides the wire message. It lives in a per-runtime registry keyed by
the message's `_msgid` (the id every clone of a message shares); NRG installs hidden
`msg.protected` / `msg.private` accessors on each node's incoming message. It is **never serialized, never cloned, never
shown in the debug panel, and invisible to a flow author's function node** — yet any node
that needs it reads it by the same message id.

## Why not the wire, or context?

This is the first question everyone asks. Node-RED already gives a message two places to
put data — put it on `msg`, or stash it in `flow`/`global` context — and **neither fits**.

### Not on `msg`

Node-RED clones the message between wires (`RED.util.cloneMessage`). A live object gets
deep-cloned — broken, or an outright throw. Node-RED itself hit this wall and hard-coded
an exception: **`msg.req` and `msg.res` are the only two properties it preserves by
reference across a clone**, precisely so the built-in HTTP In / HTTP Response pair can
recover the live response object downstream. Everything else is on its own.

And anything on `msg` is **visible in the debug panel and editable by any function node** —
so a secret leaks and a live handle can be tampered with.

### Not in flow/global context

Context is **standing state keyed by a name, not bound to a message.** Three problems
follow:

- **It races.** Node-RED delivers the next message before the current one calls `done()`,
  so two messages in flight both read and write the same `flow.get("conn")` key and clobber
  each other. There is no per-message slot.
- **It's serialization-oriented.** Context stores are pluggable — memory, localfilesystem,
  Redis, DynamoDB — and the contract is *serializable* state. A live connection, `res`,
  span, or `AbortController` doesn't belong there, and relying on a reference surviving is
  store-dependent and fragile.
- **It's visible and mutable.** Context shows up in the editor's context sidebar and any
  function node can read or overwrite it. A decrypted token leaks; a handle can be forged.

To make context work you'd key everything by `msg._msgid` and clean it up by hand —
**reinventing a per-message registry on a substrate designed for the opposite.** That
reinvention *is* message lanes; NRG just builds it in, off the wire, and hidden.

| | `msg` (wire) | flow/global context | **Message lanes** |
| --- | --- | --- | --- |
| Survives cloning between wires | No (except `req`/`res`) | N/A | **Yes** |
| Bound to one message | Yes | No (keyed by name) | **Yes (by `_msgid`)** |
| Survives the flow author's `carry`/`trace`/`reset` wire choice | No (`reset` drops it) | N/A | **Yes (rides `_msgid`)** |
| Holds live/non-serializable objects | No | No (serialization-oriented) | **Yes (in-process registry)** |
| Hidden from the flow author | No | No | **Yes** |
| Concurrency-safe across in-flight messages | Yes | No | **Yes** |

Lanes are the general, safe, hidden form of the `req`/`res` escape hatch Node-RED had to
special-case for one pair of built-in nodes.

## The two lanes

| Lane | Visible to | Use it for |
| --- | --- | --- |
| **`protected`** | a node from **any** package | cross-cutting concerns shared across vendors — a tracing span, an auth principal, an `AbortSignal` |
| **`private`** | nodes in **your own** package only | a package's internal live resources — the `res` your HTTP In node stashed for your HTTP Response node |

Both are off the wire and invisible to flow authors. The difference is *reach*: `private`
is scoped to your package (a symbol stamped on your node classes by `defineModule`), so
another vendor's nodes can't see it; `protected` is a shared channel any package can read
and write.

::: tip Namespace your `protected` keys
`protected` is a shared bus, so two packages can collide on a key. Use a namespaced key —
`msg.protected["otel.span"]`, not `msg.protected.span`.
:::

## Writing and reading lanes

`send()` takes the public message first, then optional `protected` and `private` bags:

```typescript
// send(publicMsg, protectedData?, privateData?)
this.send({ payload }, { "otel.span": span }, { conn });
```

A node reads them off its incoming message. Because the lanes aren't part of the wire
message, annotate the `input()` parameter with `& MessageLanes` to type them:

```typescript
import { IONode, type MessageLanes } from "@bonsae/nrg/server";

// The `Input` GENERIC is the wire shape (it drives the node's ports — lanes are not
// ports). The `input()` PARAMETER intersects the lanes so `msg.private` / `msg.protected`
// are typed.
type Input = { payload: unknown };

export default class MyNode extends IONode<Config, never, Input, Output> {
  static override readonly type = "my-node";

  override async input(msg: Input & MessageLanes) {
    const conn = msg.private.conn;      // package-scoped; `unknown` until you narrow it
    const span = msg.protected["otel.span"];
    // ...
  }
}
```

::: warning Keep lanes off the `Input` generic
Pass the plain wire shape (`Input`) as the generic — it drives the node's port topology,
and lanes are not ports. Add `& MessageLanes` only on the `input()` parameter.
:::

## Lifecycle: you release, the framework forgets

A lane entry is removed with `delete`:

```typescript
override async input(msg: Input & MessageLanes) {
  const res = msg.private.res;
  res.end(JSON.stringify(msg.payload));
  delete msg.private.res; // done with it
}
```

`delete` **only removes NRG's registry entry** — it does not close, end, or dispose the
resource. **The resource owns its own release.** You call `res.end()`, `conn.release()`,
`span.end()`; `delete` just tells the framework to forget the reference.

For the happy path, an explicit `delete` when you're finished is all you need. As a
backstop, NRG sweeps abandoned messages on an idle TTL (default 5 min, reset by any lane
read or write), so a flow that drops a message before anyone deletes its lanes won't leak
the registry entry forever — but an actively-used message is never swept mid-flight. There is deliberately **no
GC hook, no `WeakMap`, no finalizer, and no dispose callback** — those are non-deterministic
or don't survive the message being cloned, and they'd give a false sense that the framework
manages your resource's lifetime. It doesn't; you do.

## Example: `private` — the HTTP claim-check

The motivating case. An HTTP In node accepts a request and holds the live `res` object; an
HTTP Response node, further down the flow, must reply on that exact `res`. The `res` can't
ride the wire (it's a live socket, and cloning would break it) and must stay hidden from the
flow author. Both nodes are in the same package, so `private` fits:

```typescript
// @acme/http — http-in.ts
type Input = { payload: unknown };

export default class HttpIn extends IONode<Config, never, Input, { payload: unknown }> {
  static override readonly type = "http-in";
  override async input(msg: Input & MessageLanes) {
    // the live `res` arrived with the request; stash it off-wire, emit only JSON
    this.send({ payload: msg.payload }, undefined, { res: this.currentRes });
  }
}
```

```typescript
// @acme/http — http-response.ts
export default class HttpResponse extends IONode<Config, never, Input, never> {
  static override readonly type = "http-response";
  override async input(msg: Input & MessageLanes) {
    const res = msg.private.res as ServerResponse; // same package → visible
    res.statusCode = 200;
    res.end(JSON.stringify(msg.payload));
    delete msg.private.res; // release
  }
}
```

Because `private` is keyed by `_msgid`, two overlapping requests never cross wires — each
HTTP Response replies on the `res` that belongs to *its own* message.

## Example: `protected` — cross-package concerns

`protected` earns its place when data must cross **package** boundaries and stay off-wire.

**Distributed tracing.** A tracing package opens a live OpenTelemetry span and shares it so
that instrumented nodes from *other* packages can create child spans — without the flow
author seeing it and without it going on the wire:

```typescript
// @acme/otel — trace-start.ts
override async input(msg: Input & MessageLanes) {
  const span = tracer.startSpan("flow");
  this.send(msg, { "otel.span": span }); // protected: any package can read it
}
```

```typescript
// @bonsae/node-red-http — http-request.ts (a DIFFERENT package)
override async input(msg: Input & MessageLanes) {
  const parent = msg.protected["otel.span"];
  const child = parent ? tracer.startSpan("http", { parent }) : undefined;
  // ...
}
```

`private` couldn't do this: the HTTP node is a different vendor's package, so it can't see
`@acme/otel`'s private lane. `protected` is the shared channel that lets the whole ecosystem
cooperate.

**Auth principal.** An auth node verifies a request and attaches a *live* principal — an
object with `getAccessToken()` that transparently refreshes. Downstream nodes from any
package authorize with it, while the raw token never touches the wire (no debug-panel leak,
not forgeable by a function node):

```typescript
// @acme/auth
this.send(msg, { principal }); // protected

// @bonsae/salesforce — a different package
const token = await msg.protected.principal.getAccessToken();
```

Other data that fits the same shape: an `AbortSignal` for cooperative cancellation across
nodes, or an ambient transaction handle that cross-package nodes enlist in.

## Testing

Lanes are I/O of a node, so you test them the same way you test the wire — through the
node's observable behavior, never by reaching into the registry.

**A producer asserts what it emitted** on each lane, read off the emitted message:

```typescript
const { node } = await createNode(HttpIn, {});
node.currentRes = fakeRes;
await node.receive({ _msgid: "r1", payload: { a: 1 } });

expect(node.sent(0)[0].private.res).toBe(fakeRes);      // stashed off-wire
expect(node.sent(0)[0]).not.toHaveProperty("res");       // wire stays clean
```

**A consumer receives the lanes an upstream node would have attached** via `receive`'s
second argument, then asserts the observable side effect:

```typescript
const { node } = await createNode(HttpResponse, {});
const res = { statusCode: 0, end: vi.fn() };

await node.receive(
  { _msgid: "r1", payload: { ok: true } },
  { private: { res } }, // the incoming lanes
);

expect(res.end).toHaveBeenCalledWith('{"ok":true}');
```

`private` is placed in the node's own package partition automatically, matching what the
node sees. The end-to-end A→B recovery (one node stashes, another in the same package
reads it back by `_msgid`) is best covered by an
[integration test](./testing#server-integration-testing), where both nodes run in one
runtime and share the registry.

## When *not* to use a lane

- **Serializable data the flow author should see or route on** belongs on the wire (`msg`).
  Lanes are for live objects and hidden metadata, not ordinary payload.
- **Standing state keyed by a name** (a counter, a cache, a config) is what
  [context stores](./creating-a-node#context-storage) are for — use them.
- **Lanes are server-plane only.** They never exist in the browser/editor.
