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

:::code-group

```typescript [Functional API]
// server/nodes/my-node.ts
import { defineIONode } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/my-node";

export default defineIONode({
  type: "my-node",
  category: "my-category",
  color: "#FFFFFF",
  configSchema: ConfigsSchema,

  async input(msg) {
    this.send({ payload: msg.payload.toUpperCase() });
  },
});
```

```typescript [Class API]
// server/nodes/my-node.ts
import { IONode, type Schema, type Infer } from "@bonsae/nrg/server";
import { ConfigsSchema } from "../schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;

export default class MyNode extends IONode<Config> {
  static readonly type = "my-node";
  static readonly category = "my-category";
  static readonly color: `#${string}` = "#FFFFFF";
  static readonly configSchema: Schema = ConfigsSchema;

  async input(msg: any) {
    this.send({ payload: msg.payload.toUpperCase() });
  }
}
```

:::

::: tip
`inputs` and `outputs` are set automatically — `1` input if `inputSchema` is defined, and the number of outputs matches the `outputsSchema` array length. You don't need to specify them manually.
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
import { IONode, type Infer, type Schema } from "@bonsae/nrg/server";
import { ConfigsSchema, InputSchema, OutputSchema } from "../schemas/my-node";

type Config = Infer<typeof ConfigsSchema>;
type Input = Infer<typeof InputSchema>;
type Output = Infer<typeof OutputSchema>;

export default class MyNode extends IONode<Config, any, Input, Output> {
  static readonly type = "my-node";
  static readonly configSchema: Schema = ConfigsSchema;

  async input(msg: Input) {
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
import { someUtil } from 'esm-only-package';

export default defineIONode({
  type: "my-node",
  async input(msg) {
    const result = someUtil(msg.payload);
    this.send({ payload: result });
  },
});
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

Both server and client are built as ESM. The server gets a thin CJS bridge for Node-RED compatibility. The client is served as a native ES module in the browser.

All handled by one Vite plugin:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { nodeRed } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [nodeRed()],
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
const ConfigsSchema = defineSchema({
  name: SchemaType.String({ default: "my-node" }),
  url: SchemaType.String({ default: "", minLength: 1 }),
  server: SchemaType.NodeRef(RemoteServer),
}, { $id: "my-node:configs" });
```

Need a custom form? Create a Vue component at `client/components/{type}.vue` — it replaces the auto-generated form automatically:

```vue
<!-- client/components/my-node.vue -->
<template>
  <div>
    <div class="form-row">
      <NodeRedInput
        :value="node.name"
        label="Name"
        @update:value="node.name = $event"
        :error="errors['node.name']"
      />
    </div>
    <div class="form-row">
      <NodeRedConfigInput
        :value="node.server"
        type="remote-server"
        :node="node"
        prop-name="server"
        label="Server"
        @update:value="node.server = $event"
        :error="errors['node.server']"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  props: {
    node: { type: Object, required: true },
    errors: { type: Object, required: true },
  },
});
</script>
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
async input(msg: Input) {
  this.send({ payload: msg.payload.toUpperCase() });
}
```

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
this.send({ payload: result });
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
| **Vite** | Dev server with watch mode, hot rebuild, and Node-RED proxy |
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

Vite watches your files, auto-rebuilds server and client, and proxies to a live Node-RED instance. Change a file, see the result — no manual restart.

Standard scripts work out of the box:

```bash
pnpm dev          # dev server with hot rebuild
pnpm build        # production build
pnpm lint         # eslint
pnpm format       # prettier
pnpm tsc:server   # type-check server
pnpm tsc:client   # type-check client
```
