# Message Lanes

Two kinds of data can't safely ride the wire:

- **Live objects** — a database connection, an open HTTP `res`, a streaming handle,
  an OpenTelemetry span, an `AbortController`. These aren't JSON; Node-RED clones a
  message between wires and a deep-clone breaks them (or throws).
- **Secrets** — a decrypted access token, a signed correlation id. These *could*
  serialize, but must stay **hidden from the flow author**: left on `msg` they show
  up in the debug panel and any function node can read or forge them.

Message lanes give every message two channels that ride *alongside* it without being
*on* it:

```typescript
this.send("out", publicMsg, protectedData, privateData);

// a downstream node reads them back off its incoming message:
msg.protected["otel.span"];  // visible to a node from ANY package
msg.private.conn;            // visible to nodes in YOUR package only
delete msg.private.conn;     // release it when you're done
```

Lane data never rides the wire message. It lives in a per-runtime store keyed by the
message's `_msgid` (the id every clone of a message shares, which nrg carries across
every node); nrg installs hidden `msg.protected` / `msg.private` accessors on each
node's incoming message. Lane data is **never serialized, never cloned, never shown
in the debug panel, and invisible to a flow author's function node** — yet any node
that needs it reads it back by the same message.

Lanes are the general, safe, hidden form of the `req`/`res` escape hatch Node-RED had
to special-case for one pair of built-in nodes (more on that [below](#why-not-the-wire-or-context)).

## Choosing a channel: wire, lane, or context?

You have four places to put data. **Start on the wire and only leave it for a specific
reason.** Walk this top to bottom:

1. **Default to the wire (`msg`).** If the data is serializable *and* the flow author
   may legitimately see it, route on it, or debug it — it's ordinary payload. Put it on
   `msg`. **Stop here.**
2. **Is it standing state keyed by a name, not tied to one message?** A counter, a
   cache, a loaded config → use a [context store](./creating-a-node#context-storage),
   not a lane. **Stop here.**
3. **You leave the wire only if one of these is true:**
   - **Live object** — it breaks when Node-RED deep-clones the message: a DB
     connection, an open `res`, a streaming handle, an OTel span, an `AbortController`,
     a transaction handle.
   - **Secret / forgeable** — it *could* serialize, but must stay hidden from the flow
     author: an access token, a signed correlation id. On `msg` it leaks to the debug
     panel and any function node can read or overwrite it.

   If neither is true, go back to step 1.
4. **Now pick the lane by REACH:**
   - Only your **own package's** nodes read it back → **`private`** (a package symbol
     stamped by `defineModule`; another vendor's nodes can't see it).
   - Nodes from **other packages** must read it → **`protected`** (a shared, namespaced
     bus).

| | Serializable? | Flow author sees / routes on it | Other packages can read it | Bound to one message | Holds live objects |
| --- | --- | --- | --- | --- | --- |
| **wire `msg`** | must be | yes (that's the point) | yes | yes | no (cloned → broken) |
| **context store** | must be | yes (context sidebar) | yes | no (keyed by name) | no |
| **`private` lane** | either | no | no | yes (by `_msgid`) | yes |
| **`protected` lane** | either | no | yes | yes (by `_msgid`) | yes |

::: warning What `protected` hides — and what it doesn't
`protected` hides data from the **flow author**: the debug panel, function nodes, and
exported flow JSON. It does **not** hide it from other **installed packages** — any
package can read or overwrite a `protected` key. Use `private` when the data must be
invisible to other vendors' nodes too. Neither lane defends against malicious code you
chose to install; both defend against the flow author and the wire.
:::

### Walking the decision: an auth token

An auth node verifies a request and needs downstream nodes — in *other* packages — to
authorize with the caller's credentials.

- **Serializable?** Yes — a bearer token is a string, so the wire *could* carry it. But
  (step 3) it's a **secret**: on `msg` it appears verbatim in the debug panel
  (`msg.access_token: "eyJhbGci…"`), copy-pasteable, and any function node can read or
  forge it. → leave the wire.
- **Which lane (step 4)?** The consumer is `@bonsae/salesforce`, a **different** package
  from the `@acme/auth` node that minted it → **`protected`**, not `private`.
- **Bonus:** model it as a **live principal** (`getAccessToken()` that transparently
  refreshes) rather than a raw string. Now it's *also* a live object — a lane on two
  independent grounds — and consumers always get a fresh token instead of a stale
  snapshot.

```typescript
// @acme/auth — mints a live principal, stamps it on the shared PROTECTED lane.
override async input(msg) {                              // no annotation
  const principal = await this.verify(msg);              // { getAccessToken(): Promise<string> }
  this.send("out", msg, { "auth.principal": principal }); // raw token never touches the wire
}
```

```typescript
// @bonsae/salesforce — a DIFFERENT package. Reads the principal off the shared lane.
override async input(msg) {
  const principal = msg.protected["auth.principal"] as Principal; // lane values are `unknown`
  const token = await principal.getAccessToken();
  // ...call Salesforce with `token`
}
```

**Before:** the token sits in the debug panel in plaintext and any function node can
read or overwrite it. **After:** it's gone from the wire entirely — invisible to the
flow author, un-forgeable, and always fresh.

### Gut-check cheatsheet

| Data | Channel |
| --- | --- |
| user id, order payload, status text | **wire** |
| decrypted bearer token / auth principal | **protected** (single-package auth? `private`) |
| OTel span, `AbortSignal` for cross-node cancellation | **protected** |
| live DB connection, open `res`, streaming handle | **private** |
| DB transaction handle | **private** if one package owns the tx; **protected** if cross-package nodes enlist |
| request counter, response cache, loaded config | **context store** |

## Why not the wire, or context?

This is the first question everyone asks. Node-RED already gives a message two places to
put data — put it on `msg`, or stash it in `flow`/`global` context — and **neither fits.**

### Not on `msg`

Node-RED clones the message between wires (`RED.util.cloneMessage`). A live object gets
deep-cloned — broken, or an outright throw. Node-RED itself hit this wall and hard-coded
an exception: **`msg.req` and `msg.res` are the only two properties it preserves by
reference across a clone**, precisely so the built-in HTTP In / HTTP Response pair can
recover the live response object downstream. Everything else is on its own.

And anything on `msg` is **visible in the debug panel and editable by any function node** —
so a secret leaks and a live handle can be tampered with. What actually continues
downstream isn't your call either: the **flow author** picks `carry`/`trace`/`reset`
per wire (see [context modes](./schemas#context-modes)), so a `reset` drops the fields
you left for a later node.

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
reinvention *is* message lanes; nrg just builds it in, off the wire, and hidden.

| | `msg` (wire) | flow/global context | **Message lanes** |
| --- | --- | --- | --- |
| Survives cloning between wires | No (except `req`/`res`) | N/A | **Yes** |
| Bound to one message | Yes | No (keyed by name) | **Yes (by `_msgid`)** |
| Survives the flow author's `carry`/`trace`/`reset` wire choice | No (`reset` drops it) | N/A | **Yes (rides `_msgid`)** |
| Holds live/non-serializable objects | No | No (serialization-oriented) | **Yes (in-process store)** |
| Hidden from the flow author | No | No | **Yes** |
| Concurrency-safe across in-flight messages | Yes | No | **Yes** |

::: info Why a function node can't reach a lane
The lane store is **server-plane** (one per runtime, with a per-package partition for
`private`), and nrg only installs the `msg.protected` / `msg.private` accessors on *its
own* nodes' incoming messages. A core function node just receives a plain `msg` — same
`_msgid`, but no accessor and no way to reach the store. The lanes are structurally invisible to the flow author, not merely
undocumented.
:::

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

You **write** lanes through `send`'s 3rd and 4th arguments — the port and value come first,
then optional `protected` and `private` bags:

```typescript
// send(portNameOrIndex, value, protectedData?, privateData?)
this.send("out", { payload }, { "otel.span": span }, { conn });

// same lanes, a named port
this.send("rows", rows, { "otel.span": span }, { conn });
```

A node **reads** the lanes back off its incoming message. The lanes are already on the
`input()` parameter type, so the simplest way to get them typed is to **omit the parameter
annotation** — TypeScript infers `msg` from the base method, where your `TInput` generic
declares the node's input port:

```typescript
import { IONode, type Input, type Port } from "@bonsae/nrg/server";

// The input GENERIC is the wire shape (it drives the node's ports — lanes are not
// ports). Leave the input() PARAMETER un-annotated and `msg.private` / `msg.protected`
// are typed for you.
type MyNodeInput = Input<Port<{ payload: unknown }>>;

export default class MyNode extends IONode<Config, never, MyNodeInput, MyNodeOutputs> {
  static override readonly type = "my-node";

  override async input(msg) {                    // no annotation
    const conn = msg.private.conn;               // package-scoped; `unknown` until you narrow it
    const span = msg.protected["otel.span"];     // shared; `unknown` until you narrow it
    // ...
  }
}
```

::: warning Don't re-annotate with the bare wire type
Leaving the parameter un-annotated infers the wire shape **plus** the lanes. Re-annotating
it with the plain wire type — `input(msg: { payload: unknown })` — is accepted by TypeScript
but **discards the lanes** from the parameter's static type. If you want an explicit
annotation, use the same `Input<Port<…>>` type you passed as the generic (`MyNodeInput`
above), which carries the lanes with it.
:::

::: info `_msgid` is not an author field
nrg keys the lanes by the message's `_msgid` internally, but `_msgid` is **not** on the
`input()` parameter type — it won't appear in autocomplete, and reading it through the
typed `msg` is a compile error. It's framework plumbing: overwriting it would fork the
message from its lanes. You never need it — read and write lanes through
`msg.protected` / `msg.private`, and let nrg do the correlation.
:::

## Lifecycle: you release, the framework forgets

A lane entry is removed with `delete`:

```typescript
override async input(msg) {
  const res = msg.private.res as ServerResponse;
  res.end(JSON.stringify(msg.output));
  delete msg.private.res; // done with it
}
```

`delete` **only removes nrg's store entry** — it does not close, end, or dispose the
resource. **The resource owns its own release.** You call `res.end()`, `conn.release()`,
`span.end()`; `delete` just tells the framework to forget the reference.

For the happy path, an explicit `delete` when you're finished is all you need. As a
backstop, nrg sweeps abandoned messages on an idle TTL (default 5 min, reset by any lane
read or write), so a flow that drops a message before anyone deletes its lanes won't leak
the store entry forever — but an actively-used message is never swept mid-flight. There is
deliberately **no GC hook, no `WeakMap`, no finalizer, and no dispose callback** — those
are non-deterministic or don't survive the message being cloned, and they'd give a false
sense that the framework manages your resource's lifetime. It doesn't; you do.

## Example: `private` — the HTTP claim-check

The motivating case. An HTTP In node accepts a request and holds the live `res` object; an
HTTP Response node, further down the flow, must reply on that exact `res`. The `res` can't
ride the wire (it's a live socket, and cloning would break it) and must stay hidden from the
flow author. Both nodes are in the same package, so `private` fits:

```typescript
// @acme/http — http-in.ts  (a SOURCE node: TInput = never)
import { IONode, type Outputs, type Port } from "@bonsae/nrg/server";

type HttpInOutputs = Outputs<{ out: Port<{ payload: unknown }> }>;

export default class HttpIn extends IONode<Config, never, never, HttpInOutputs> {
  static override readonly type = "http-in";

  override async created() {
    this.RED.httpNode.get(this.config.url, (req, res) => {
      // Emit the clone-safe snapshot on the wire; stash the LIVE `res` on the
      // private lane (4th arg). nrg mints an `_msgid` for this source send, keys
      // the lane by it, and carries that id across every downstream node.
      this.send("out", { payload: req.query }, undefined, { res });
    });
  }
}
```

```typescript
// @acme/http — http-response.ts  (a SINK node: TOutput = never)
import { IONode, type Input, type Port } from "@bonsae/nrg/server";

type HttpResponseInput = Input<Port<{ payload: unknown }>>;

export default class HttpResponse extends IONode<Config, never, HttpResponseInput, never> {
  static override readonly type = "http-response";

  override async input(msg) {                       // no annotation
    const res = msg.private.res as ServerResponse | undefined; // same package → visible
    if (!res) return;                               // already answered, or not ours
    delete msg.private.res;                         // claim it — answered exactly once
    res.statusCode = 200;
    res.end(JSON.stringify(msg.output));
  }
}
```

Because `private` is keyed by `_msgid`, two overlapping requests never cross wires — each
HTTP Response replies on the `res` that belongs to *its own* message, even when responses
complete out of order. Deleting the entry up front also makes the request **answered
exactly once**: a second HTTP Response for the same signal finds `msg.private.res`
undefined and no-ops. (This is the pattern `@bonsae/node-red-http` uses — plus a `504`
idle-timeout on the socket, since the resource owns its own release.)

## Example: `protected` — cross-package concerns

`protected` earns its place when data must cross **package** boundaries and stay off-wire.
The [auth token](#walking-the-decision-an-auth-token) above is the flagship. Two more:

**Distributed tracing.** A tracing package opens a live OpenTelemetry span and shares it so
that instrumented nodes from *other* packages can create child spans — without the flow
author seeing it and without it going on the wire:

```typescript
// @acme/otel — trace-start.ts
override async input(msg) {
  const span = tracer.startSpan("flow");
  this.send("out", msg, { "otel.span": span }); // protected: any package can read it
}
```

```typescript
// @bonsae/node-red-http — http-request.ts (a DIFFERENT package)
override async input(msg) {
  const parent = msg.protected["otel.span"] as Span | undefined;
  const child = parent ? tracer.startSpan("http", { parent }) : undefined;
  // ...
}
```

`private` couldn't do this: the HTTP node is a different vendor's package, so it can't see
`@acme/otel`'s private lane. `protected` is the shared channel that lets the whole ecosystem
cooperate.

**Cooperative cancellation.** A source stamps an `AbortSignal` on the shared lane; a
long-running node from any package honors it:

```typescript
// producer — stamp the signal
const controller = new AbortController();
this.send("out", msg, { "abort.signal": controller.signal });

// consumer in another package — honor it
const signal = msg.protected["abort.signal"] as AbortSignal | undefined;
const res = await fetch(url, { signal });
```

## Testing

Lanes are I/O of a node, so you test them the same way you test the wire — through the
node's observable behavior, never by reaching into the store.

**A producer asserts what it emitted** on each lane, read off the emitted message:

```typescript
const { node } = await createNode(Producer, {});
await node.receive({ _msgid: "r1", payload: { a: 1 } });

expect(node.sent(0)[0].private.res).toBe(fakeRes);  // stashed off-wire
expect(node.sent(0)[0]).not.toHaveProperty("res");  // wire stays clean
```

**A consumer receives the lanes an upstream node would have attached** via `receive`'s
second argument, then asserts the observable side effect:

```typescript
const { node } = await createNode(HttpResponse, {});
const res = { statusCode: 0, end: vi.fn() };

await node.receive(
  { _msgid: "r1", output: { ok: true } },
  { private: { res } }, // the incoming lanes
);

expect(res.end).toHaveBeenCalledWith('{"ok":true}');
```

`private` is placed in the node's own package partition automatically, matching what the
node sees. (`receive`'s message needs an `_msgid` whenever you seed lanes — that's the key
they hang off; the harness throws if you seed lanes without one.) The end-to-end A→B
recovery — one node stashes, another in the same package reads it back — is best covered by
an [integration test](./testing#server-integration-testing), where both nodes run in one
runtime and share the store.

## When *not* to use a lane

- **Serializable data the flow author should see or route on** belongs on the wire (`msg`).
  Lanes are for live objects and hidden metadata, not ordinary payload.
- **Standing state keyed by a name** (a counter, a cache, a config) is what
  [context stores](./creating-a-node#context-storage) are for — use them.
- **Lanes are server-plane only.** They never exist in the browser/editor.
