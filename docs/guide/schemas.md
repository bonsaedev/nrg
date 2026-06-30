# Schema Validation

NRG uses [TypeBox](https://github.com/sinclairzx81/typebox) schemas for runtime validation on both server and client. Schemas serve two purposes: they validate data at runtime with AJV, and they provide TypeScript type inference via `Infer`.

## Defining Schemas

Use `defineSchema` to create a schema with an optional (but recommended) `$id`. Import the builders from **`@bonsae/nrg/schema`** — a neutral entry that carries only the schema builders and TypeBox, with no node runtime, so a schema module in `src/shared/schemas/` never depends on `./server`:

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

The `$id` is optional but strongly recommended: when present it must be unique across all schemas and is used as the AJV cache key. If omitted, a per-schema cache key is derived from the node type.

::: tip Where the builders live
`@bonsae/nrg/schema` ships only the builders plus TypeBox — no node runtime — so a dedicated file in `src/shared/schemas/` stays decoupled from the server. `@bonsae/nrg/server` re-exports `defineSchema`/`SchemaType` as well, so a node that defines its schema inline can import them next to `IONode` from a single entry. Type inference (`Infer`, below) is plane-specific — always from `@bonsae/nrg/server` on the server or `@bonsae/nrg/client` on the client.
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
import type { ConfigsSchema, CredentialsSchema } from "../../shared/schemas/my-node";

const { node, errors } = useFormNode<typeof ConfigsSchema, typeof CredentialsSchema>();
// each field resolves to its editor form: a plain field stays as-is, a NodeRef
// field → string (node id), a TypedInput field → { value: string; type: string }
```

Note the `import type` — it is erased at build time, so it's safe. Never **value**-import a schema module into client or browser code (including component tests): the module imports `defineSchema`/`SchemaType` from `@bonsae/nrg/schema`, which pulls in TypeBox — kept out of the browser bundle by design. In component tests, resolve schemas by node `type` via `createNode({ type })` instead — see [Testing › Resolving schemas by node type](/guide/testing#resolving-schemas-by-node-type).

See [Custom Form Component](/guide/creating-a-node#custom-form-component) for a full example.

## Config Schema

The `configSchema` static property validates node configuration when a node instance is created. Validation failures produce warnings (they don't prevent the node from starting):

```typescript
export default class MyNode extends IONode<Config> {
  static readonly configSchema: Schema = ConfigsSchema;
  // ...
}
```

Default values from the schema are used by the editor to initialize new node instances.

### Output and the message envelope

Every node produces an **`output`**. `this.send(x)` always means "x is the
result" — never "x is the whole outgoing message". The framework merges the
value into the incoming message:

```
this.send(result)
// outgoing: { ...msg, output: result }
```

So upstream context propagates automatically. By default (`carry` mode) the
context flows through without growing; opt into `trace` mode to also keep the
full prior message under **`input`** as a recoverable **provenance trail**
(`msg.input.output`…) — see [Context modes](#context-modes). `outputsSchema`
describes the result value (output validation runs before the merge).

This means a node sets only `output` — it does not set arbitrary top-level
message properties. Multi-value results go under `output` as one object:

```typescript
this.send({ records, totalSize, done }); // msg.output = { records, totalSize, done }
```

To interoperate with Node-RED core nodes (which key on `msg.payload`,
`msg.topic`, etc.), use a `change`/`set` node at the boundary to map `output`
onto the property the core node expects.

#### Custom return properties per port {#overriding-the-return-key}

Every output port's return key is `"output"`. Declaring `outputReturnProperties`
lets the node author set a different default **per port** — and surfaces an
editable **Return Property** column in the editor's Outputs table so flow authors
can override each port's key:

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
- Built-in **complete** and **error** ports always carry `input` (so a flow
  resumed off the complete port — e.g. an iterator continuing after all elements
  — keeps the same lineage); the **status** port is a notification and stays raw.

These per-port settings — validation, return property, and context mode — are
configured by the flow author in the editor's **Outputs** table:

![The generated editor form, showing the per-port Outputs table](/editor-form.png)

#### Context modes {#context-modes}

`send()` and `sendToPort()` take no mode argument — how each output carries the
incoming context is resolved **per port** from config, falling back to `carry`.
`carry` is both the default and the floor; to let the flow author choose a
different mode per port, declare `outputContextModes`:

```typescript
const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    // port 0 is configurable (its dropdown is seeded to `trace`); every other
    // port stays locked to `carry`
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "trace" },
    }),
  },
  { $id: "my-node:configs" },
);
```

This surfaces a **Context Mode** column in the editor's Outputs table. A port
**with** a declared default renders an editable dropdown seeded to that value; a
port **without** one renders `carry`, disabled — the author opts each port in by
giving it a default:

![The Outputs table's Context Mode column — ports 0 and 1 have schema defaults so their dropdowns are editable; port 2 has none and is locked to carry, disabled](/context-modes.png)

The three modes:

- **carry** (default/floor): keep all incoming keys (including any upstream
  `input`) but don't record this node, so context flows through without the
  provenance chain growing. The safe default for loops and long chains.
- **trace**: full provenance — keep all incoming keys and also push the prior
  message under `input`, so every overwritten value stays recoverable
  (`msg.input.output`). The chain grows one frame per node; opt in for linear
  flows that want lineage.
- **reset**: the outgoing message is only the result — use for source nodes that
  intentionally start a fresh context.

Without `outputContextModes`, every port resolves to `carry` and the column is
hidden. Named-port sends (`sendToPort`) resolve the same per-port mode by index.

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
  static readonly configSchema: Schema = ConfigsSchema;
  static readonly credentialsSchema: Schema = CredentialsSchema;

  async input(msg: Input) {
    const apiKey = this.credentials?.apiKey;
    // ...
  }
}
```

The build system automatically extracts credential field types (text/password) from the schema for the Node-RED editor.

## Input Schema

Validate incoming messages before they reach your `input()` handler:

```typescript
const InputSchema = defineSchema(
  {
    payload: SchemaType.String(),
    topic: SchemaType.Optional(SchemaType.String()),
  },
  { $id: "my-node:input" }
);

export default class MyNode extends IONode<Config, any, Input> {
  static readonly inputSchema: Schema = InputSchema;
  static readonly validateInput = true;

  async input(msg: Input) {
    // msg.payload is guaranteed to be a string here
  }
}
```

Set `validateInput = true` on the class to enable validation. Invalid messages throw an error.

## Output Schema

Validate outgoing messages when `this.send()` is called:

```typescript
const OutputSchema = defineSchema(
  {
    payload: SchemaType.Object({
      result: SchemaType.String(),
      timestamp: SchemaType.Number(),
    }),
  },
  { $id: "my-node:output" }
);

export default class MyNode extends IONode<Config, any, Input, Output> {
  static readonly outputsSchema: Schema = OutputSchema;
  static readonly validateOutput = true;

  async input(msg: Input) {
    this.send({
      payload: { result: "ok", timestamp: Date.now() },
    });
  }
}
```

For nodes with multiple outputs, provide an array of schemas. The number of output ports is derived from the array length — there is no `outputs` property to set manually:

```typescript
export default class MyNode extends IONode<Config> {
  static readonly outputsSchema: Schema[] = [SuccessSchema, FailedSchema];
  static readonly validateOutput = true;

  async input(msg: Input) {
    try {
      // Send to first output
      this.send([{ payload: "success" }, null]);
    } catch {
      // Send to second output
      this.send([null, { payload: "failed" }]);
    }
  }
}
```

`validateOutput` is `boolean | boolean[]`. A single boolean validates **every** output port; a `boolean[]` sets the default **per port**, indexed by base-output position (missing entries default to `false`). This lets a node validate the data ports while leaving a non-data or best-effort port unchecked:

```typescript
export default class MyNode extends IONode<Config> {
  static readonly outputsSchema: Schema[] = [ResultSchema, DebugSchema];
  // validate port 0 (result), leave port 1 (debug) unchecked
  static readonly validateOutput = [true, false];
}
```

Either way, the flow author can override any port from the node's **Outputs** table in the editor, and that per-instance choice takes precedence over the author default. Note that the editor's **Validate** toggles show only per-instance overrides, not the author default: a toggle renders unchecked even when the node sets `validateOutput` to `true` for that port. The port still validates at runtime — the author default applies until the flow author explicitly toggles validation off.

For **named output ports**, provide a record instead of an array — each key becomes a port, its name shows as the editor label, and `sendToPort()` gets per-port type safety and autocomplete:

```typescript
export default class MyNode extends IONode<Config> {
  static readonly outputsSchema = {
    success: SuccessSchema,
    failure: FailureSchema,
  };

  async input(msg: Input) {
    this.sendToPort("success", { payload: "ok" });
  }
}
```

So `outputsSchema` takes three shapes: a single `Schema` (one port), a `Schema[]` (N positional ports), or a `Record<string, Schema>` (N named ports). See [Named Output Ports](./creating-a-node#named-output-ports) for the full treatment.

## Non-data inputs & outputs {#non-data-ports}

Not every port carries plain data. A node might emit a function, a class
instance, a `Buffer` or stream, or a database client — or accept a message with
non-serializable parts. JSON Schema can't describe those values, so a normal
schema would reject or coerce them.

Declare such a value as a **named property** of an object schema and type it with
**`SchemaType.Unsafe<T>()`**. It produces an empty schema (`{}`), so AJV passes
any runtime value through while `Infer` still resolves the field to `T`. `T` is
erased at runtime, but the build reads the `<T>` you wrote straight from the
source, so the generated node help still shows it in the **Type** column — you
write the type just once:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

type Connection = { query(sql: string): Promise<unknown[]> };

const OutputSchema = defineSchema(
  {
    // non-data: typed as Connection, never validated — but still documented
    connection: SchemaType.Unsafe<Connection>({
      description: "Open pool connection, passed downstream",
    }),
    // data alongside it is still validated normally
    rowCount: SchemaType.Number({ minimum: 0, description: "Rows affected" }),
  },
  { $id: "db-open:output" }
);

export default class OpenConnection extends IONode<Config, any, Input, Output> {
  static readonly outputsSchema: Schema = OutputSchema;
  static readonly validateOutput = true;

  async input() {
    this.send({ connection: pool, rowCount: 0 }); // pool passes through intact
  }
}
```

The generated node help then renders the **Output** table with `connection`
typed as `Connection` and `rowCount` as `number [min: 0]`, so the port's
TypeScript type is visible to anyone reading the node's docs — recovered from the
source at build time, with nothing to keep in sync by hand.

For that recovery to work, keep `Unsafe<T>()` as a **named property** of a schema
built with `defineSchema` — its `$id` is how the build links the type it read
from `<T>` back to the property. The same applies to `inputSchema` for non-data
inputs.

::: warning Config-node references and typed inputs are NOT `Unsafe` cases
Don't reach for `Unsafe` here — these have first-class builders the editor and
the client type-resolver understand, and skipping them loses both:

- **Config-node reference** → `SchemaType.NodeRef<TheConfigClass>("the-config-type")`
  — stored as the node id; resolves to `string` on the client. The class is a
  type-only generic (import it with `import type`); only the `type` string is
  passed at runtime. This is also why the reference must stay a type: the server
  node value-imports this schema, so a schema that *value*-imported the node back
  would form an import cycle. The `@bonsae/nrg/schema-server-imports-type-only`
  lint rule (in `nrgConventions`) enforces that schemas only `import type` from
  `server/`.
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
  static readonly settingsSchema: Schema = SettingsSchema;

  async input(msg: Input) {
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
