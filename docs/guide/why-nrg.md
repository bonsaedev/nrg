# Why NRG?

Building Node-RED nodes the traditional way involves writing raw HTML templates, jQuery bindings, callback-based APIs, and manual validation — with no type safety. NRG replaces all of that with TypeScript, JSON Schemas, Vue 3, and Vite.

## Message Flow

A flow is a message hopping from node to node. The difference is **who decides whether it keeps going — and how much of it travels along.**

```text
TRADITIONAL  --  decided by the node's author, in code

   msg --> [ node ] --> send(msg)? --> next node
                            |
                            +-- forget this, and the flow stops (no error)

NRG  --  decided by the flow author, on the wire

   msg --> [ node ] --> result --> next node
                            |
                            +-- carry | trace | reset   (chosen per wire)
```

In classic Node-RED every node has to remember to pass the message on; miss it once and the flow silently dead-ends — and whoever built the flow can't fix it from the outside. NRG flips this: the node just returns its result, the framework carries the incoming message for you, and the **flow author** decides per output how much of it continues — the last message (`carry`), the full history (`trace`), or a clean slate (`reset`). See [context modes](./schemas#context-modes).

## Live Objects & Hidden Data

Two kinds of data can't safely ride the wire: **live objects** that break when Node-RED clones the message (a DB connection, an open HTTP `res`, a streaming handle, an OpenTelemetry span, an `AbortController`), and **secrets** that could be serialized but must never be seen — a decrypted access token, a signed correlation id. Node-RED gives a message two places to put data (`msg` and context) and neither is safe for either kind.

**"Why would a secret be on a message at all — isn't that what a config node's credentials are for?"** Static credentials are perfect when the secret is *per-deployment*: a fixed API key, shared by every message. But some secrets are *per-message*. An auth node verifies *this* request and mints a token for *this* caller (multi-tenant, per-user); a node exchanges or refreshes a short-lived token at runtime; a node decrypts a field that a later node needs. That data is derived from one in-flight message and consumed by a *different* node downstream — so it has to travel *with* the message. The wire is the only channel bound to a single message, which is exactly why per-message data wants to live there. It just isn't safe to carry a secret — and that's the gap lanes fill: the wire's per-message binding, without the exposure.

### Traditional

**Three ways `msg` fails you:**

1. **Secrets leak.** Put a token on `msg` and it shows up verbatim in the debug panel — `msg.access_token: "eyJhbGci…"`, copy-pasteable, and any function node can read or overwrite it.
2. **Live objects break.** Node-RED deep-clones `msg` between wires, so a live socket or connection is corrupted or throws — which is exactly why Node-RED had to hard-code `msg.req` / `msg.res` as the *only* two reference-preserved exceptions, so its own HTTP In / HTTP Response pair could work at all.
3. **You don't decide what continues.** The **flow author** picks `carry`/`trace`/`reset` per wire (see [Message Flow](#message-flow) above), so a `reset` drops the fields you left for a later node — and anything non-JSON on `msg` is silently dropped whenever the message is serialized (debug panel, context store, exported flow).

**In flow/global context?** Context is standing state keyed by a **name**, not bound to a message. Node-RED delivers the next message before the current one finishes, so two messages in flight write the same `flow.get("conn")` key and clobber each other — there is no per-message slot. Context stores are also pluggable and serialization-oriented (memory, localfilesystem, Redis, DynamoDB): live objects don't belong there, and the store is inspectable and writable from the editor and from function nodes. To make it work you'd key everything by `msg._msgid` and clean up by hand — reinventing a per-message registry on a substrate designed for the opposite.

### NRG

**Message lanes.** NRG gives every message two off-the-wire lanes that ride *alongside* it without being *on* it — one **`private`** (scoped to your package), one **`protected`** (shared across packages). The flagship: an auth node stamps a *live* principal on the **protected** lane, and a Salesforce node in a *different* package authorizes with it — the raw token never rides the wire, never hits the debug panel, and can't be forged by a function node:

```typescript
// @acme/auth — mints a live principal, stamps it on the shared protected lane
// send(port, value, protectedData?, privateData?)
this.send("out", { userId }, { "auth.principal": principal });

// @bonsae/salesforce — a DIFFERENT package reads it back and authorizes
const token = await (msg.protected["auth.principal"] as Principal).getAccessToken();
```

Lane data lives in a per-runtime store keyed by the message's `_msgid`; NRG installs hidden `msg.protected` / `msg.private` accessors on each node's incoming message. It is **never serialized, never cloned, never shown in the debug panel, and invisible to a flow author's function node** — yet any node that needs it reads it back by the same message, and it survives every `carry`/`trace`/`reset` wire choice because it rides the `_msgid`, not the payload. It's the general, safe form of the `req`/`res` escape hatch Node-RED had to special-case for one pair of built-in nodes. Pick `private` vs `protected` by reach — see [Message Lanes](./message-lanes) for the full decision guide.

## Node Registration

### Traditional

Spread across multiple files. HTML for the editor, JavaScript for the runtime, duplicated metadata in both.

```
my-node/
  my-node.html     ← editor template + client registration
  my-node.js       ← runtime logic
  package.json
```

**my-node.js**
```javascript
module.exports = function(RED) {
  function MyNode(config) {
    RED.nodes.createNode(this, config);
    this.server = config.server;
    this.on('input', function(msg, send, done) {
      msg.payload = msg.payload.toUpperCase();
      send(msg);
      done();
    });
  }
  RED.nodes.registerType('my-node', MyNode);
}
```

**my-node.html**
```html
<script type="text/javascript">
RED.nodes.registerType('my-node', {
  category: 'function',
  color: '#FFFFFF',
  defaults: {
    name: { value: '' },
    server: { value: '', type: 'remote-server' }
  },
  inputs: 1,
  outputs: 1,
  label: function() { return this.name || 'my-node'; }
});
</script>

<script type="text/html" data-template-name="my-node">
  <div class="form-row">
    <label for="node-input-name">Name</label>
    <input type="text" id="node-input-name">
  </div>
</script>
```

### NRG

One TypeScript file for the node. Input and output types are plain TypeScript — you declare them directly, no schema required. A config schema drives the editor form and validation. No HTML, no jQuery.

```typescript
// server/nodes/my-node.ts
import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;
type MyNodeInput = Input<Port<{ payload: string }>>;
type MyNodeOutputs = Outputs<{ out: Port<{ uppercased: string }> }>;

export default class MyNode extends IONode<
  Config,
  never,
  MyNodeInput,
  MyNodeOutputs
> {
  static override readonly type = "my-node";
  static override readonly category = "my-category";
  static override readonly color = "#FFFFFF";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: MyNodeInput) {
    this.send("out", { uppercased: msg.payload.toUpperCase() });
  }
}
```

> Schemas live in `src/shared/schemas`; import them with the `@/schemas` alias — shipped in NRG's base tsconfig, build, and test configs, so `@/schemas/my-node` resolves with no setup.

::: tip
You never set `inputs`/`outputs` by hand. Port topology comes from the node's **types** — the `IONode` input/output generics. See [Inputs and Outputs](./creating-a-node#inputs-and-outputs).
:::

```typescript
// server/index.ts
import { defineModule } from "@bonsae/nrg/server";
import MyNode from "./nodes/my-node";

export default defineModule({ nodes: [MyNode] });
```

## Fully TypeScript

### Traditional

Node-RED nodes are JavaScript. No type checking, no autocomplete, no compile-time errors. You find bugs at runtime.

```javascript
// What type is msg.payload? Who knows.
// What properties does config have? Check the HTML.
// Did you typo a property name? You'll find out when it crashes.
module.exports = function(RED) {
  function MyNode(config) {
    RED.nodes.createNode(this, config);
    this.on('input', function(msg, send, done) {
      var result = msg.paylaod; // typo — no error until runtime
      send(msg);
      done();
    });
  }
  RED.nodes.registerType('my-node', MyNode);
}
```

### NRG

Full TypeScript — config, credentials, input, output, and settings are all typed. Catch errors at compile time.

```typescript
import {
  IONode,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import { ConfigsSchema } from "@/schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;
type MyNodeInput = Input<Port<{ payload: string }>>;
type MyNodeOutputs = Outputs<{ out: Port<{ processedTime: number }> }>;

export default class MyNode extends IONode<
  Config,
  never,
  MyNodeInput,
  MyNodeOutputs
> {
  static override readonly type = "my-node";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: MyNodeInput) {
    // msg.paylaod → compile error: Property 'paylaod' does not exist
    // this.config.server → typed as RemoteServer instance
    // this.config.name → typed as string
    this.send("out", { processedTime: Date.now() });
  }
}
```

## ESM-First Build

### Traditional

Node-RED loads packages with `require()` (CommonJS). Using ESM-only npm dependencies — which are increasingly common — requires workarounds like dynamic `import()` inside CJS, bundlers, or forking the dependency.

```javascript
// This doesn't work in a CJS Node-RED node:
import { someUtil } from 'esm-only-package'; // SyntaxError

// Workaround: dynamic import inside a CJS module
module.exports = function(RED) {
  function MyNode(config) {
    RED.nodes.createNode(this, config);
    this.on('input', async function(msg, send, done) {
      const { someUtil } = await import('esm-only-package');
      // ...
    });
  }
  RED.nodes.registerType('my-node', MyNode);
}
```

### NRG

Node-RED can only load a node with `require()` (the older CommonJS format), but many modern packages ship only in the newer ESM format. NRG bridges the two for you: it builds your node as ESM and generates a tiny CommonJS file that Node-RED loads with `require()`, which then imports your ESM bundle. The result: you can import any ESM-only dependency directly and it just works.

```typescript
// Just import it. NRG handles the rest.
import { IONode, type Input, type Port } from "@bonsae/nrg/server";
import { someUtil } from 'esm-only-package';

export default class MyNode extends IONode {
  static override readonly type = "my-node";

  override async input(msg: Input<Port<{ payload: unknown }>>) {
    const result = someUtil(msg.payload);
    this.send("out", { result });
  }
}
```

```
# Build output
dist/
  index.js           ← CJS bridge (Node-RED loads this via require())
  index.mjs          ← server ESM bundle (your code + dependencies)
  resources/
    index.[hash].js  ← client ESM bundle (Vue components + editor logic)
  package.json       ← auto-generated with correct exports
```

Both server and client are built as ESM: the server gets a thin CJS bridge for Node-RED compatibility, while the client is served as a native ES module in the browser.

All handled by one Vite plugin:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { nrg } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nrg()],
});
```

## Editor Forms

### Traditional

Write HTML inside a `<script>` tag. Wire up jQuery event handlers. Manage state manually.

```html
<script type="text/html" data-template-name="my-node">
  <div class="form-row">
    <label for="node-input-name">Name</label>
    <input type="text" id="node-input-name">
  </div>
  <div class="form-row">
    <label for="node-input-url">URL</label>
    <input type="text" id="node-input-url">
  </div>
  <div class="form-row">
    <label for="node-input-server">Server</label>
    <input type="text" id="node-input-server">
  </div>
</script>

<script type="text/javascript">
RED.nodes.registerType('my-node', {
  category: 'function',
  color: '#FFFFFF',
  defaults: {
    name: { value: '' },
    url: { value: '', validate: function(v) { return v.length > 0; } },
    server: { value: '', type: 'remote-server' }
  },
  inputs: 1,
  outputs: 1,
  label: function() { return this.name || 'my-node'; },
  oneditprepare: function() {
    // manual DOM setup...
  }
});
</script>
```

### NRG

Define a schema. The editor form is auto-generated with validation and inline error messages — all for free.

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
import type RemoteServer from "../../server/nodes/remote-server";

const ConfigsSchema = defineSchema({
  name: SchemaType.String({ default: "my-node" }),
  url: SchemaType.String({ default: "", minLength: 1 }),
  server: SchemaType.NodeRef<RemoteServer>("remote-server"),
}, { $id: "my-node:configs" });
```

Need a custom form? Create a Vue component at `client/components/{type}.vue` — it replaces the auto-generated form automatically:

```vue
<!-- client/components/my-node.vue -->
<script setup lang="ts">
import { useFormNode } from "@bonsae/nrg/client";
import type { ConfigsSchema } from "@/schemas/my-node";

const { node, errors } = useFormNode<typeof ConfigsSchema>();
</script>

<template>
  <NodeRedInput
    v-model="node.name"
    label="Name"
    :error="errors['node.name']"
  />
  <NodeRedConfigInput
    v-model="node.server"
    label="Server"
    type="remote-server"
    :node="node"
    prop-name="server"
    :error="errors['node.server']"
  />
</template>
```

## Input Handler

### Traditional

Receive `msg`, `send`, and `done` as callbacks. Call `done()` manually — forget it and the node leaks.

```javascript
this.on('input', function(msg, send, done) {
  try {
    msg.payload = msg.payload.toUpperCase();
    send(msg);
    done();
  } catch(err) {
    done(err);
  }
});
```

### NRG

An async method. `done()` is called automatically when it returns or rejects.

```typescript
override async input(msg: MyNodeInput) {
  this.send("out", { uppercased: msg.payload.toUpperCase() });
}
```

## Async, Concurrency-Safe Input

### Traditional

`send` and `done` are handed to you as callback arguments, so if you do any async work you have to carry them along by hand through every `.then`, `await`, or timer. Worse, the same node instance handles every message, and Node-RED delivers the next `msg` without waiting for `done()` — so if you save anything on `this`, an overlapping message can overwrite it mid-flight.

```javascript
this.on('input', function(msg, send, done) {
  this.current = msg;                 // shared on `this`; the next input
                                      // overwrites it mid-flight
  fetchRemote(msg.payload)
    .then((result) => {
      // Is `this.current` still *this* msg? Not if another arrived while
      // we awaited. `send`/`done` had to be captured in this closure too.
      send({ payload: result });
      done();
    })
    .catch(done);
});
```

### NRG

Write an async `input`. You can call `this.send()` from anywhere — after an `await`, inside a `.then`, or from a timer — and NRG still knows which incoming message it belongs to. Behind the scenes each `input()` call runs in its own isolated scope, so two messages handled at the same time never mix up each other's data, and you never have to stash anything on `this`. `done()` is called for you when the method finishes; and if you turn on the complete port, a returned value is sent out of it.

```typescript
override async input(msg: Input<Port<{ payload: string }>>) {
  const result = await fetchRemote(msg.payload);
  // Resolves this message's context even after awaiting — no threading
  // `send`/`done`, no correlation ids, no races.
  this.send("out", { result });
}
```

## Lifecycle Ports

### Traditional

Say you want a node that loops over a list, sends each item into the flow, then runs one final **Summarize** step after the last item. Node-RED has no built-in node that emits many messages and then signals "I'm finished", so people fake it: they wire the node's **output back into its own input**, so each run emits one item and re-triggers the node for the next one. Handling "finished" and "failed" needs two more nodes — a **Complete** node and a **Catch** node — each configured to watch the iterator.

```text
   +----------------------------+   output looped back into input
   |                            |
   |  +--------------+          |
   +->|   Iterator   |----------+--> Process Item
      +--------------+

  +- - - - - - - - -+        +-----------+
    Complete           . . > | Summarize |   "done" teleports
    scope: [Iterator]        +-----------+
  +- - - - - - - - -+
  +- - - - - - - - -+        +------------+
    Catch              . . > | Notify Ops |   "error" teleports
    scope: [Iterator]        +------------+
  +- - - - - - - - -+
```

You can place the **Complete** and **Catch** nodes right next to the iterator to make the connection look obvious, but nothing enforces it. What actually links them is the iterator's id listed in each node's scope setting — not where they sit on the canvas. So the tidy layout is a hint you keep neat by hand, not a guarantee the tooling gives you.

### NRG

The iterator is one node with three outputs: the **each** output for the loop body, plus the toggleable **complete** and **error** lifecycle ports. The loop lives inside `input()` — send each element, `return` to leave the complete port, `throw` to leave the error port. No feedback wire, no teleporting Complete/Catch node; every branch is a real wire leaving the node.

```text
  +--------------+
  |   Iterator   |-- each ------> Process Item
  |              |-- complete --> Summarize
  |              |-- error -----> Notify Ops
  +--------------+
```

```typescript
override async input(msg: Input<Port<{ items: string[] }>>) {
  for (const item of msg.items) {
    this.send("each", { item });        // each element → `each` output → Process Item
  }
  return { count: msg.items.length };   // → `complete` port → Summarize
  // a throw (or this.error(message, msg)) → `error` port → Notify Ops
}
```

Now the loop, its success, and its failure all read top-to-bottom in one method, and on the canvas they are three real wires you can follow — not a self-loop plus two nodes linked by hidden scope. What each port carries:

- **`complete`** — `input()`'s returned value, under a `complete` key.
- **`error`** — `{ error: { name, message, stack }, source, input: msg }`, the same shape a Catch node reads, but it travels this wire instead of firing a Catch node.
- **`status`** — whatever you pass to `this.status(...)`.

## TypedInput Resolution

### Traditional

Callback-based, untyped, verbose.

```javascript
var self = this;
RED.util.evaluateNodeProperty(
  self.target.value,
  self.target.type,
  self, msg,
  function(err, result) {
    if (err) { done(err); return; }
    // result is untyped
    send({ payload: result });
    done();
  }
);
```

### NRG

Async, typed, one line.

```typescript
const result: string = await this.config.target.resolve(msg);
this.send("out", { result });
```

## Config Node References

### Traditional

Manual lookup, no type safety, no autocomplete.

```javascript
var server = RED.nodes.getNode(this.server);
if (server) {
  console.log(server.host); // hope this exists
}
```

### NRG

Auto-resolved via the config proxy, fully typed.

```typescript
const server = this.config.server;
console.log(server.config.host); // autocomplete works
```

## Validation

### Traditional

Write individual validator functions for each field. You get the error triangle and red borders, but no descriptive error messages — the user has to guess what's wrong.

```javascript
defaults: {
  name: { value: '', validate: RED.validators.regex(/^.+$/) },
  url: { value: '', validate: function(v) {
    return v.startsWith('http');
  }}
}
```

### NRG

Define validation rules in the schema once. Get the error triangle, inline error messages with descriptions (e.g. "must NOT have fewer than 5 characters"), and server-side validation — all from one source.

```typescript
const ConfigsSchema = defineSchema({
  name: SchemaType.String({ minLength: 1 }),
  url: SchemaType.String({ format: "uri" }),
}, { $id: "my-node:configs" });
```

## Development Experience

### Traditional

No standard tooling. Most projects use plain JavaScript with no build step, no type checking, and no formatting. Every change requires restarting Node-RED, refreshing the browser, and re-deploying the flow.

```
edit file → restart Node-RED → refresh browser → re-deploy flow → test → repeat
```

### NRG

NRG brings the modern JavaScript ecosystem to Node-RED development:

| Tool | Role |
| --- | --- |
| **Vite** | Dev server that watches, rebuilds, restarts Node-RED, and proxies to it |
| **esbuild** | Fast TypeScript/ESM bundling for server and client |
| **tsc** | Type checking at build time — errors caught before deploy |
| **Vue 3** | Component-based editor forms with reactivity |
| **ESLint** | Lint your nodes with standard rules |
| **Prettier** | Consistent code formatting across the project |
| **Vitest** | Unit and integration testing (same Vite config) |

One command to start:

```bash
pnpm dev
```

Vite watches your files, rebuilds the server and client on change, and proxies to a live Node-RED instance. Every change — server or client — triggers a full Node-RED restart; then refresh the browser to load the rebuilt editor and forms.

This is a rebuild-and-restart loop, **not** hot module replacement (HMR): the page reloads fully, so any open edit-dialog state resets. Your flow definitions, however, survive the restart — Node-RED preserves them.

Standard scripts work out of the box:

```bash
pnpm dev            # dev server: watch, rebuild, restart Node-RED
pnpm build          # production build
pnpm validate       # type-check + lint + format (validate:tsc / :lint / :format)
pnpm validate:tsc   # type-check
```
