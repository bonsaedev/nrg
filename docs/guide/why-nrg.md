# Why NRG?

Building Node-RED nodes the traditional way involves writing raw HTML templates, jQuery bindings, callback-based APIs, and manual validation — with no type safety. NRG replaces all of that with TypeScript, JSON Schemas, Vue 3, and Vite.

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

One TypeScript file for the node. Schema drives the editor form, validation, and type inference. No HTML, no jQuery.

```typescript
// server/nodes/my-node.ts
import { IONode, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema, InputSchema, OutputSchema } from "@/schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;
type Input = Infer<typeof InputSchema>;
type Output = Infer<typeof OutputSchema>;

export default class MyNode extends IONode<Config, never, Input, Output> {
  static override readonly type = "my-node";
  static override readonly category = "my-category";
  static override readonly color = "#FFFFFF";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: Input) {
    this.send({ uppercased: msg.payload.toUpperCase() });
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

Full TypeScript with types inferred from your schemas. Config, credentials, input, output, and settings are all typed. Catch errors at compile time.

```typescript
import { IONode, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema, InputSchema, OutputSchema } from "@/schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;
type Input = Infer<typeof InputSchema>;
type Output = Infer<typeof OutputSchema>;

export default class MyNode extends IONode<Config, never, Input, Output> {
  static override readonly type = "my-node";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: Input) {
    // msg.paylaod → compile error: Property 'paylaod' does not exist
    // this.config.server → typed as RemoteServer instance
    // this.config.name → typed as string
    this.send({ processedTime: Date.now() });
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

NRG builds your node as an ESM bundle with a CJS bridge — Node-RED's `require()` loads the bridge, which `import()`s the ESM bundle. Use any ESM-only dependency directly.

```typescript
// Just import it. NRG handles the rest.
import { IONode } from "@bonsae/nrg/server";
import { someUtil } from 'esm-only-package';

export default class MyNode extends IONode {
  static override readonly type = "my-node";

  override async input(msg: { payload: unknown }) {
    const result = someUtil(msg.payload);
    this.send({ result });
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
override async input(msg: Input) {
  this.send({ uppercased: msg.payload.toUpperCase() });
}
```

## Async, Concurrency-Safe Input

### Traditional

`send` and `done` arrive as callback arguments, so any async work forces you to thread them through every `.then`, `await`, or timer by hand. Worse, the node instance is shared across messages — Node-RED delivers the next `msg` without waiting for `done()`, so anything you stash on `this` races with overlapping inputs.

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

Write an `async input`. Call `this.send()` from anywhere — after an `await`, inside a `.then`, or from a timer — and it lands in _this_ invocation's context. Each call runs in its own `AsyncLocalStorage` scope, so concurrent messages never clobber each other and there is no shared `this` state to race on. `done()` fires automatically; a returned value leaves the node's complete port.

```typescript
override async input(msg: Input) {
  const result = await fetchRemote(msg.payload);
  // Resolves this message's context even after awaiting — no threading
  // `send`/`done`, no correlation ids, no races.
  this.send({ result });
}
```

## Lifecycle Ports

### Traditional

Take an **iterator** that walks a list, runs each element through the flow, then continues once — to **Summarize** — after the last one. Node-RED has no node that fans out many messages and then signals it is done, so people build it as a feedback loop: wire the node's **output back into its own input** so each pass emits one element and re-triggers the node for the next. Iteration becomes recursion drawn on the canvas. "Done" and "failed" have nowhere to go either — you bolt on a **Complete** node and a **Catch** node scoped to the iterator (teleporting) to continue when the loop drains or an element throws.

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

You can make the Complete/Catch link _look_ obvious by convention — parking them beside the iterator or wrapping the group — but nothing enforces it: the binding is the id in the scope list, not the position on the canvas, so the tidy layout is a hint you maintain by hand, not a guarantee the tooling gives you.

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
override async input(msg: Input) {
  for (const item of msg.items) {
    this.send({ item });                // each element → `each` output → Process Item
  }
  return { count: msg.items.length };   // → `complete` port → Summarize
  // a throw (or this.error(message, msg)) → `error` port → Notify Ops
}
```

The loop, its completion, and its failure read top-to-bottom in one method, and on the canvas they are three wires you can follow — not a self-loop plus two nodes coupled by hidden scope. `complete` carries the returned value under `output`; `error` emits `{ ...msg, error: { name, message, source }, input: msg }`, the same shape a Catch node consumes; `status` mirrors `this.status(...)`.

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
this.send({ result });
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
