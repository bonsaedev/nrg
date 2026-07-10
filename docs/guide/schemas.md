# Schema Validation

NRG uses [TypeBox](https://github.com/sinclairzx81/typebox) schemas for runtime validation on both server and client. Schemas serve two purposes: they validate data at runtime with AJV, and they render/validate the editor form.

::: info Schemas do not define ports
Schemas are optional. What ports a node has — and what type flows over each wire — comes from the node's **TypeScript types** (the `IONode` generics), not from schemas. See [Inputs and Outputs](./creating-a-node#inputs-and-outputs). Use a schema only when you want to check data at runtime.

If you'd like one schema to be the single source for **both** the check and the type, write the schema, get its type with [`Infer`](#infer-drives-types), and pass that type to the node — the type still drives the ports and wiring, and the two can't drift.
:::

## Defining Schemas

Use `defineSchema` to create a schema (the `$id` is optional). Import the builders from **`@bonsae/nrg/schema`** — a neutral entry that carries only the schema builders and TypeBox, with no node runtime, so a schema module in `src/shared/schemas/` never value-imports the node runtime:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    retries: SchemaType.Number({ default: 3, minimum: 0, maximum: 10 }),
    verbose: SchemaType.Boolean({ default: false }),
    tags: SchemaType.Array(SchemaType.String(), { default: [] }),
    metadata: SchemaType.Optional(
      SchemaType.Object({
        version: SchemaType.String(),
      })
    ),
  },
  { $id: "my-node:configs" }
);
```

The `$id` is **optional**. It's the AJV compile-cache key (validators are reused per `$id`), and it makes the schema addressable for cross-schema `$ref`. Omit it and a unique one is generated for you, so no two schemas can collide; provide your own only when you want a stable, readable key. Convention: `"<node-type>:<role>"` (e.g. `"my-node:configs"`, `"my-node:credentials"`).

> Schemas live in `src/shared/schemas`; import them with the `@/schemas` alias — shipped in NRG's base tsconfig, build, and test configs, so `@/schemas/my-node` resolves with no setup.

::: tip Where the builders live
Import the builders (`defineSchema`, `SchemaType`) and the schema types (`Schema`, `TNodeRef`, `TTypedInput`) from `@bonsae/nrg/schema` — they are **not** re-exported from `@bonsae/nrg/server`. That entry ships only the builders plus TypeBox (no node runtime), so a schema file in `src/shared/schemas/` never pulls in the node runtime. The one exception is `Infer` (below): import it from `@bonsae/nrg/server` in server code and from `@bonsae/nrg/client` in editor/client code.
:::

## Type Inference

Extract the TypeScript type from any schema:

```typescript
import type { Infer } from "@bonsae/nrg/server";

type Config = Infer<typeof ConfigsSchema>;
// { name: string; retries: number; verbose: boolean; tags: string[]; metadata?: { version: string } }
```

### Client-Side Inference

The client package resolves the same schemas to their editor form representation. `NodeRef` becomes `string` (the node ID stored in the editor) and `TypedInput` becomes `{ value: string; type: string }`:

```typescript
import { useFormNode } from "@bonsae/nrg/client";
import type { ConfigsSchema, CredentialsSchema } from "@/schemas/my-node";

const { node, errors } = useFormNode<typeof ConfigsSchema, typeof CredentialsSchema>();
// each field resolves to its editor form: a plain field stays as-is, a NodeRef
// field → string (node id), a TypedInput field → { value: string; type: string }
```

Note the `import type` — it is erased at build time, so it's safe. Never **value**-import a schema module into client or browser code (including component tests): the module imports `defineSchema`/`SchemaType` from `@bonsae/nrg/schema`, which pulls in TypeBox — kept out of the browser bundle by design. In component tests, resolve schemas by node `type` via `createNode({ type })` instead — see [Testing › Resolving schemas by node type](/guide/testing#resolving-schemas-by-node-type).

See [Custom Form Component](/guide/creating-a-node#custom-form-component) for a full example.

### Driving node types from schemas {#infer-drives-types}

Because topology comes from the generics, a schema can be the single source of truth for **both** validation and the type: author the schema, derive the type with `Infer`, and pass it to the generic. The type still drives the ports and wiring; `Infer` just keeps it in lock-step with the schema so they can't drift.

For a single output port, wrap the derived type in `Port<…>` inside the `TOutput` record; the same schema can validate what the port emits:

```typescript
import { IONode, type Infer, type Port } from "@bonsae/nrg/server";
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
import { ConfigSchema, InputSchema } from "@/schemas/api";

const OkSchema = defineSchema({ value: SchemaType.Number() }, { $id: "api:ok" });

export default class Api extends IONode<
  Infer<typeof ConfigSchema>, // config type from the schema
  never,
  Infer<typeof InputSchema>, // input message type from the schema
  { ok: Port<Infer<typeof OkSchema>> } // one named "ok" port, typed from OkSchema
> {
  static override readonly type = "api";

  override async input(msg: Infer<typeof InputSchema>) {
    this.sendToPort("ok", { value: 1 }); // typed from the "ok" port's Port<T>
  }
}
```

`Infer` also accepts a **record of schemas** and produces a named-port output map, so you can derive the whole `TOutput` from one place:

```typescript
const Outputs = { ok: OkSchema, err: ErrSchema };

class Router extends IONode<Config, never, Input, Infer<typeof Outputs>> {
  override async input(msg: Input) {
    this.sendToPort("ok", { value: 1 }); // "ok" | "err" typed from the record
  }
}
```

This is a convenience, not a requirement — plain TypeScript types (with no schema) declare topology just as well. Reach for the `Infer` form to keep a port's type in lock-step with a schema.

## Config Schema

The `configSchema` static property validates node configuration when a node instance is created. Validation failures produce warnings (they don't prevent the node from starting):

```typescript
export default class MyNode extends IONode<Config> {
  static override readonly configSchema = ConfigsSchema;
  // ...
}
```

Default values from the schema are used by the editor to initialize new node instances.

### Output and the message envelope

Whatever you pass to `this.send(x)` is treated as the result value — never as the
whole outgoing message. The framework wraps it for you: it puts your value under
**`output`** and keeps the message that came in under **`input`** (so you can
still read `msg.input.output`). Example:

```
this.send(result)
// outgoing: { output: result, source: { id, type, name, port }, input: msg }
```

So the prior message stays recoverable under `input` (`msg.input.output`…). How
deep that history goes is the per-port **context mode** — `carry` (default, last
message only), `trace` (the full `input.input…` chain), or `reset` (no history);
see [Context modes](#context-modes). Output data validation, when enabled, runs
on the result value before wrapping.

This means a node sets only `output` — it does not set arbitrary top-level
message properties. Multi-value results go under `output` as one object:

```typescript
this.send({ records, totalSize, done }); // msg.output = { records, totalSize, done }
```

To interoperate with Node-RED core nodes (which key on `msg.payload`,
`msg.topic`, etc.), use a `change`/`set` node at the boundary to map `output`
onto the property the core node expects.

#### Custom return properties per port {#overriding-the-return-key}

Every output port's return key is `"output"`. The editor's Outputs table always
shows an editable **Return Property** column for every IONode — the framework
injects `outputReturnProperties` into every node — so flow authors can override
each port's key. Declaring `outputReturnProperties` in your own schema doesn't
make the column appear; it lets the node **author** change the default **per
port**:

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

- Keyed by output port index; a missing or empty entry falls back to `"output"`.
- Keys must be valid JavaScript identifiers — validated in the editor and again
  at node construction.
- Named-port sends (`sendToPort`) resolve the same per-port key by index.
- Built-in **complete** and **error** ports carry `source` (producing node) and
  the failing/finishing message (`input`) at the **root**, side by side with the
  port's payload block — the same shape as a data port. The **error** port's data
  is in `error` (where a Catch node reads it); the **complete** port carries
  `input()`'s return value under `complete` (a `void` return omits the key). The
  **status** port is a notification and stays raw. Note: an enabled **error** port
  is the _sole_ error handler — the error travels its wire and does not also fire
  Node-RED `catch` nodes (those are the fallback only when
  a node has no error port).

These per-port settings — validation, return property, and context mode — are
configured by the flow author in the editor's **Outputs** table:

![The generated editor form, showing the per-port Outputs table](/editor-form.png)

#### Context modes {#context-modes}

`send()` and `sendToPort()` take no mode argument — how each output carries the
incoming context is resolved **per port** from config, falling back to `carry`.
The flow author can always pick a mode for **any** port in the editor. Declaring
`outputContextModes` only lets the node **author** change a port's starting value
(its seeded default):

```typescript
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // port 0's dropdown starts on `trace` instead of `carry`; every other port
    // starts on `carry`. All ports remain editable by the flow author either way.
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "trace" },
    }),
  },
  { $id: "my-node:configs" },
);
```

The **Context Mode** column is always present in the editor's Outputs table (for
any node with output ports — the framework injects `outputContextModes`), and
**every port's dropdown is editable**. A port with a declared default is simply
seeded to that value; a port without one is seeded to `carry`. Declaring
`outputContextModes` does not enable or lock any port — it only changes the seed:

![The Outputs table's Context Mode column — every port has an editable dropdown; ports with a declared default are seeded to it, others to carry](/context-modes.png)

The three modes are one dial — **how deep the `input` history goes**. Every mode
puts the result at the return key and the incoming message under `input`; the
outgoing root is always just the result (incoming keys are never re-flattened at
the root):

- **carry** (default) — keep only the immediately-previous message under `input`;
  older history is dropped, so the chain never grows past one level
  (`msg.input.output` is the previous result). Safe for loops and long chains.
- **trace** — keep the full chain: each node adds a frame (`msg.input.input`…)
  all the way back to the source. Use it when you want a provenance trail.
- **reset** — keep no history: the outgoing message is just the result, with no
  `input` frame. Use it for source nodes that intentionally start fresh.

(A send with no incoming message — a source node, or a send outside any
`input()` call — records no `input` frame.)

Without a declared `outputContextModes`, every port is seeded to `carry` — but its
dropdown is still editable and the column is still shown whenever the node has
output ports. Named-port sends (`sendToPort`) resolve the same per-port mode by
index.

The framework never deep-clones (so streams, Buffers, and class instances pass
through intact); Node-RED's runtime clones messages 2..N on fan-out, so parallel
output branches are already isolated from each other at delivery.

## Credentials Schema

Credentials are stored separately and encrypted by Node-RED. Define them with `credentialsSchema`:

```typescript
export const CredentialsSchema = defineSchema(
  {
    apiKey: SchemaType.String({ default: "" }),
    secret: SchemaType.String({ default: "" }),
  },
  { $id: "my-node:credentials" }
);
```

```typescript
export default class MyNode extends IONode<Config, Credentials> {
  static override readonly configSchema = ConfigsSchema;
  static override readonly credentialsSchema = CredentialsSchema;

  override async input(msg: Input) {
    const apiKey = this.credentials?.apiKey;
    // ...
  }
}
```

The build system automatically extracts credential field types (text/password) from the schema for the Node-RED editor.

## What validation does — config vs. message data {#validation-semantics}

NRG validates two things very differently, on purpose.

**Config, credentials, and settings are _coerced_.** These come from the editor
form (and Node-RED settings), where every value starts life as a string. Their
schemas run through a validator with **type coercion and defaults ON**, so values
are converted to their declared types and any untouched field is filled from its
`default` **before your node sees it**. That's why `this.config.retries` reads as
the number `3` even though the form stored `"3"`, and why a field the flow author
never touched still has its default. You never coerce config by hand — this is the
same AJV coercion nrg has always done for the config plane.

**Input and output _message data_ is not coerced — only checked.** Port validation
runs a **pure predicate**: no coercion, no defaults, and it never rewrites the
message. If it fails the node throws (routed to the error port when enabled); if it
passes, the message flows through byte-for-byte. It is also **opt-in** — off unless
(a) an effective schema resolves for the port (a default the node author seeded, or
one the flow author types in the editor) **and** (b) the port's _Validate_ toggle is
on. The `inputSchema` / `outputSchemas` config fields exist on every IONode
automatically, so you never have to "expose" them.

**The port _types_ are compile-time only.** `TInput`/`TOutput` (and `Port<T>`) are
erased at build. They drive the editor's port topology and wire type-checks, and
they type your handler while you author, but they do **not** exist at runtime and
do **not** convert data. So if your node needs a value in a specific runtime shape,
convert it yourself:

```typescript
override async input(msg: Input) {
  // `msg.count` is TYPED as number for you, but at runtime it's whatever the
  // upstream node actually sent — coerce it yourself if that matters.
  const count = Number(msg.count);
  // ...
}
```

Rule of thumb: use a `TypedInput` **config** field when a _flow author_ fills in a
value in the editor — it gets converted to the right type for you. Use a port
**schema** when you want to _reject_ a bad incoming/outgoing message at the
boundary — it only checks the data, it never converts it.

### When should you add a port schema?

You don't need one for topology or types — the generics already give you those.
Seed a default input/output validation schema (a `SchemaType.InputSchema` /
`SchemaType.OutputSchemas` config field) and turn validation on when you want to:

- **fail fast on bad data** at a trust boundary — reject a malformed message to the
  error port instead of crashing deep in the handler; or
- **publish a checkable contract** a flow author can tighten per instance.

Skip it when the wire type is enough and you're happy to handle whatever arrives.
Either way, remember: a port schema **validates**, it doesn't coerce or default the
message.

## Input Data Validation

Input validation **checks** incoming messages before they reach your `input()` handler. It does not create the input port (the `Input` generic does), and it is **not** a static on the class — it's a **config-schema framework control**. The input Schema editor and _Validate_ toggle render on every IONode already; adding a `SchemaType.InputSchema()` field to your config schema just seeds a default JSON Schema in that editor. The flow author can then override it and turn the per-instance _Validate_ toggle on.

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // seed a default input-validation schema (Monaco-editable by the flow author)
    inputSchema: SchemaType.InputSchema({
      default: JSON.stringify({
        type: "object",
        properties: { payload: { type: "string" } },
        required: ["payload"],
      }),
    }),
  },
  { $id: "my-node:configs" }
);
```

Validation runs when the flow author turns on the port's _Validate_ toggle (which sets `config.validateInput`). Invalid messages throw an error — routed to the error port when it's enabled. Validation is a **pure predicate**: it never coerces or defaults the message.

## Output Data Validation

Output validation **checks** each value you `send()` before it leaves the port. Like input validation, it is **not** a static — it's a **config-schema framework control**, and the per-port Schema editor and _Validate_ toggle render on every IONode already. Seed per-port default output schemas by adding a `SchemaType.OutputSchemas()` field to your config schema, keyed by output port index. Each entry seeds that port's default validation schema (Monaco-editable by the flow author):

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // seed a default validation schema for output port 0
    outputSchemas: SchemaType.OutputSchemas({
      default: {
        0: JSON.stringify({
          type: "object",
          properties: {
            result: { type: "string" },
            timestamp: { type: "number" },
          },
        }),
      },
    }),
  },
  { $id: "my-node:configs" }
);
```

A port validates when the flow author turns on its _Validate_ toggle (which sets `config.validateOutputs[port]`) and a schema exists for that port. Only ports you seed a default for are overridable in the editor. Validation is a pure predicate — it never coerces or defaults the outgoing value.

Port **count and names** come from the `Output` generic, not from these schemas — a single type is one port, a `Port<T>` record is named ports, a tuple is positional ports. See [Inputs and Outputs](./creating-a-node#inputs-and-outputs) and [Named Output Ports](./creating-a-node#named-output-ports).

## Configuring validation in the editor {#editor-schema-overrides}

Input and output data validation is a **config-schema framework control** — never a static on the class. The controls render on every IONode automatically; adding a `SchemaType.InputSchema()` / `SchemaType.OutputSchemas()` field to your **config** schema just seeds the node author's default validation schema. The flow author can override that default per instance and turn validation on — without touching your code.

Two pieces make this work:

1. **The Validate toggle.** Every IONode's **Ports Settings** table already shows a _Validate_ toggle per port (input and output). Toggling it writes `config.validateInput` / `config.validateOutputs[port]`, which enable validation for that instance.
2. **The Schema editor.** An editable **Schema** button (a Monaco JSON editor) already appears per port in the Ports Settings table. Declaring `SchemaType.InputSchema()` (input) / `SchemaType.OutputSchemas()` (outputs) just seeds that editor with the `default` you provide.

```typescript
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // expose an editable input-validation schema (Monaco), seeded with a default
    inputSchema: SchemaType.InputSchema({ default: '{ "type": "object" }' }),
    // expose per-port output-validation schemas; only ports given a default
    // here are overridable — port 0 is editable, port 1 stays disabled
    outputSchemas: SchemaType.OutputSchemas({
      default: { 0: '{ "type": "object" }' },
    }),
  },
  { $id: "my-node:configs" },
);
```

The schema a flow author types is stored as a JSON-Schema **string** in `config.inputSchema` / `config.outputSchemas[port]`; NRG uses it when present and valid. An unparseable or non-compiling schema is ignored (warned once). Validation still runs only when the port's _Validate_ toggle is on.

![Editor: configuring input and output validation schemas](/editor-schemas.png)

## Non-data inputs & outputs {#non-data-ports}

Not every port carries plain data. A node might emit a function, a class
instance, a `Buffer` or stream, or a database client — or accept a message with
non-serializable parts. A port's **type** comes from the `Input`/`Output`
generic, so a non-data value just needs a plain type — there is nothing to
validate:

```typescript
import { IONode } from "@bonsae/nrg/server";

type Connection = { query(sql: string): Promise<unknown[]> };
type Output = { connection: Connection; rowCount: number };

export default class OpenConnection extends IONode<Config, any, Input, Output> {
  static override readonly type = "db-open";
  static override readonly configSchema = ConfigsSchema;

  override async input() {
    this.send({ connection: pool, rowCount: 0 }); // pool passes through intact
  }
}
```

The build reads the `Output` generic, so the generated node help renders the
**Output** table with `connection` typed as `Connection` and `rowCount` as
`number` — recovered from the source at build time, with nothing to keep in sync
by hand.

The wire carries the **actual object**, not a copy — the framework never
deep-clones `output`, so a live stream or an HTTP request/response travels the
wire and works downstream unchanged. A node can emit a `Readable` on a typed
port:

```typescript
import { IONode, type Port } from "@bonsae/nrg/server";
import { Readable } from "node:stream";

type Output = { body: Port<Readable> };

export default class FetchStream extends IONode<Config, any, { url: string }, Output> {
  static override readonly type = "fetch-stream";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: { url: string }) {
    const res = await fetch(msg.url);
    // Send the Readable itself — the wire moves the STREAM object, not its
    // bytes. A downstream node receives this exact instance and can `.pipe()` it.
    this.sendToPort("body", Readable.fromWeb(res.body!));
  }
}
```

`Port<Readable>` type-checks the wire in the editor — it only connects to a node
whose input accepts a `Readable`. The same pattern carries an HTTP request/
response pair (`{ req: Port<IncomingMessage>; res: Port<ServerResponse> }`), a
`Buffer`, a socket, or any class instance: nrg nodes compose like typed function
calls that pass real objects around, not just JSON hand-offs.

If you additionally want **runtime data validation** on the data fields (via the
`SchemaType.OutputSchemas()` config control — see
[Configuring validation in the editor](#editor-schema-overrides)), JSON Schema
can't describe a non-data value, so a normal schema would reject it. Type such a
field with **`SchemaType.Unsafe<T>()`**: it produces an empty schema (`{}`), so
AJV passes any runtime value through while the data fields alongside it validate
normally:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const OutputSchema = defineSchema(
  {
    // non-data: never validated — AJV passes it through
    connection: SchemaType.Unsafe<Connection>({
      description: "Open pool connection, passed downstream",
    }),
    // data alongside it is still validated normally
    rowCount: SchemaType.Number({ minimum: 0, description: "Rows affected" }),
  },
  { $id: "db-open:output" }
);
```

Keep `Unsafe<T>()` as a **named property** of a schema built with `defineSchema`.
The same applies to an input-validation schema for non-data inputs.

::: warning Config-node references and typed inputs are NOT `Unsafe` cases
Don't use `Unsafe` for these — they have proper builders the editor and the
client type-resolver understand:

- **Config-node reference** → `SchemaType.NodeRef<TheConfigClass>("the-config-type")`
  — stored as the node id; resolves to `string` on the client. Import the config
  class with `import type` (only its type is used; nothing is imported at
  runtime). An eslint rule (`@bonsae/nrg/schema-server-imports-type-only`, in
  `nrg`) enforces this type-only import.
- **Typed input** → `SchemaType.TypedInput()` — resolves to `{ value, type }`.
:::

### Choosing the right builder

| Builder | Validates | Static type | Use when |
| --- | --- | --- | --- |
| `SchemaType.Object({ … })` | yes | inferred | plain data |
| `SchemaType.NodeRef<Cfg>("cfg-type")` | yes | `string` (node id) | a config-node reference |
| `SchemaType.TypedInput()` | yes | `{ value, type }` | a Node-RED TypedInput |
| `SchemaType.Unsafe<T>()` | no | **`T`** | a non-data value you want typed (function, instance, `Buffer`, stream, connection) |
| `SchemaType.Any()` | no | `any` | a truly untyped passthrough |
| `SchemaType.Unknown()` | no | `unknown` | force the consumer to narrow before use |
| `SchemaType.Unsafe<T>({ …json… })` | yes | `T` | a custom/branded static type **with** real validation |

Prefer `Unsafe<T>()` over `Any()` for non-data ports — both skip validation, but
`Unsafe<T>()` keeps full type safety on `msg.output` and the input message. Reach
for it rather than `SchemaType.Function`/`Constructor` too: those emit a non-JSON
`type` keyword that only validates cleanly when the schema is built with
`defineSchema` (which strips it via `markNonValidatable`), whereas `Unsafe<T>()`
is already an empty schema with nothing for AJV to choke on.

Because the framework never deep-clones `output`, these non-data values reach the
next node intact — see [Output and the message envelope](#output-and-the-message-envelope).

## Settings Schema

Define Node-RED runtime settings that your node reads from `settings.js`:

```typescript
const SettingsSchema = defineSchema(
  {
    apiEndpoint: SchemaType.String({ default: "https://api.example.com" }),
    maxConnections: SchemaType.Number({ default: 5 }),
  },
  { $id: "my-node:settings" }
);

export default class MyNode extends IONode<Config, any, Input, any, Settings> {
  static override readonly settingsSchema = SettingsSchema;

  override async input(msg: Input) {
    const endpoint = this.settings.apiEndpoint;
    // ...
  }
}
```

Settings are validated once when the node type is first registered. They're accessed via `this.settings` with full type safety.

Setting keys in `settings.js` are prefixed with the camelCase version of the node type. For a node with `type = "my-node"`, the settings key `apiEndpoint` maps to `myNodeApiEndpoint` in the Node-RED settings file.

::: info Future changes
NRG currently uses [AJV](https://ajv.js.org/) for runtime schema validation. A future release may replace AJV with TypeBox's native validation and upgrade to [TypeBox v1](https://www.npmjs.com/package/typebox) (published as `typebox` on npm). This may introduce changes to schema definitions and validation behavior.
:::
