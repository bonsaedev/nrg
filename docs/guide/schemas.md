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

Note the `import type` — it is erased at build time, so it's safe. Never **value**-import a schema module into client or browser code (including component tests): the module imports `defineSchema`/`SchemaType` from `@bonsae/nrg/schema`, which pulls in TypeBox — kept out of the browser bundle by design. In component tests, resolve schemas by node `type` via `createNode({ type })` instead — see [Client Component & E2E › Resolving schemas by node type](/guide/testing-client-e2e#resolving-schemas-by-node-type).

See [Custom Form Component](/guide/editor-form#custom-form-component) for a full example.

### Driving node types from schemas {#infer-drives-types}

Because topology comes from the generics, a schema can be the single source of truth for **both** validation and the type: author the schema, derive the type with `Infer`, and pass it to the generic. The type still drives the ports and wiring; `Infer` just keeps it in lock-step with the schema so they can't drift.

For a single output port, wrap the derived type in `Port<…>` inside the `Outputs<…>` record; the same schema can validate what the port emits:

```typescript
import { IONode, type Infer, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
import { ConfigSchema, InputSchema } from "@/schemas/api";

const OkSchema = defineSchema({ value: SchemaType.Number() }, { $id: "api:ok" });

type ApiInput = Input<Port<Infer<typeof InputSchema>>>; // input wire type from the schema
type ApiOutputs = Outputs<{ ok: Port<Infer<typeof OkSchema>> }>; // one named "ok" port, typed from OkSchema

export default class Api extends IONode<
  Infer<typeof ConfigSchema>, // config type from the schema
  never,
  ApiInput,
  ApiOutputs
> {
  static override readonly type = "api";

  override async input(msg: ApiInput) {
    this.send("ok", { value: 1 }); // typed from the "ok" port's Port<T>
  }
}
```

For **multiple** named ports, wrap each derived type in `Port<…>` inside the `Outputs<…>` record — one place, one schema per port:

```typescript
type RouterOutputs = Outputs<{
  ok: Port<Infer<typeof OkSchema>>;
  err: Port<Infer<typeof ErrSchema>>;
}>;

class Router extends IONode<Config, never, RouterInput, RouterOutputs> {
  override async input(msg: RouterInput) {
    this.send("ok", { value: 1 }); // "ok" | "err" — both typed from their schemas
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

The value you pass to `this.send()` is merged onto the flow's accumulating
record (`{ ...incoming, ...additions }`), with provenance stamped on `msg._meta`;
the incoming record is always carried forward. All of that — the record model,
merging, and provenance — lives in [The Message Model](./message-model).


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
type MyNodeInput = Input<Port<{ payload: string }>>;
type MyNodeOutputs = Outputs<{ out: Port<{ result: string }> }>;

export default class MyNode extends IONode<
  Config,
  Credentials,
  MyNodeInput,
  MyNodeOutputs
> {
  static override readonly configSchema = ConfigsSchema;
  static override readonly credentialsSchema = CredentialsSchema;

  override async input(msg: MyNodeInput) {
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
one the flow author types in the editor) **and** (b) the port's _Validate Data_ toggle is
on. The `inputSchema` / `outputSchemas` config fields exist on every IONode
automatically, so you never have to "expose" them.

**The port _types_ are compile-time only.** `Input`/`Outputs` (and `Port<T>`) are
erased at build. They drive the editor's port topology and wire type-checks, and
they type your handler while you author, but they do **not** exist at runtime and
do **not** convert data. So if your node needs a value in a specific runtime shape,
convert it yourself:

```typescript
// type MyNodeInput = Input<Port<{ count: number }>>;
override async input(msg: MyNodeInput) {
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

## Input Data Validation {#input-schema}

Input validation **checks** incoming messages before they reach your `input()` handler. It does not create the input port (the `Input` generic does), and it is **not** a static on the class — it's a **config-schema framework control**. The input _Data Schema_ editor and _Validate Data_ toggle render on every IONode already; adding a `SchemaType.InputSchema()` field to your config schema just seeds a default JSON Schema in that editor. The flow author can then override it and turn the per-instance _Validate Data_ toggle on.

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

Validation runs when the flow author turns on the port's _Validate Data_ toggle (which sets `config.validateInput`). Invalid messages throw an error — routed to the error port when it's enabled. Validation is a **pure predicate**: it never coerces or defaults the message.

### What input validation checks {#input-validation-scope}

Input validation runs against the **whole incoming message**, not only the fields your `Input` type declares — the schema alone decides what's allowed. Two things follow:

- **It's independent of the port type.** The `inputSchema` is authored (your default, or the flow author's editor override), so it can require or shape fields the `Input<Port<T>>` type never mentions, and vice versa. The type drives the wire check and types your handler; the schema is the runtime gate.
- **Leave `additionalProperties` open.** Because the message is the flow's shared, accumulating record, it carries fields other nodes added upstream. Validate only the fields you actually read (as above — `required: ["payload"]`, no `additionalProperties: false`); setting `additionalProperties: false` would reject every field the record legitimately accumulated.

## Output Data Validation {#output-schema}

Output validation **checks** each value you `send()` before it leaves the port. Like input validation, it is **not** a static — it's a **config-schema framework control**, and the per-port _Data Schema_ editor and _Validate Data_ toggle render on every IONode already. Seed per-port default output schemas by adding a `SchemaType.OutputSchemas()` field to your config schema, keyed by output port index. Each entry seeds that port's default validation schema (Monaco-editable by the flow author):

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

A port validates when the flow author turns on its _Validate Data_ toggle (which sets `config.validateOutputs[port]`) and a schema exists for that port. Only ports you seed a default for are overridable in the editor. Validation is a pure predicate — it never coerces or defaults the outgoing value.

Port **count and names** come from the `Output` generic, not from these schemas — a one-key `Outputs<{ out: Port<T> }>` is a single named port, a multi-key `Port<T>` record is multiple named ports, and an `Outputs<Port<T>[]>` array is dynamic index-addressed ports. See [Inputs and Outputs](./creating-a-node#inputs-and-outputs) and [Named Output Ports](./creating-a-node#named-output-ports).

## Configuring validation in the editor {#editor-schema-overrides}

Input and output data validation is a **config-schema framework control** — never a static on the class. The controls render on every IONode automatically; adding a `SchemaType.InputSchema()` / `SchemaType.OutputSchemas()` field to your **config** schema just seeds the node author's default validation schema. The flow author can override that default per instance and turn validation on — without touching your code.

Two pieces make this work:

1. **The Validate Data toggle.** Every IONode's **Ports Settings** table already shows a _Validate Data_ toggle per port (input and output). Toggling it writes `config.validateInput` / `config.validateOutputs[port]`, which enable validation for that instance.
2. **The Data Schema editor.** An editable **Data Schema** button (a Monaco JSON editor) already appears per port in the Ports Settings table. Declaring `SchemaType.InputSchema()` (input) / `SchemaType.OutputSchemas()` (outputs) just seeds that editor with the `default` you provide.

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

The schema a flow author types is stored as a JSON-Schema **string** in `config.inputSchema` / `config.outputSchemas[port]`; NRG uses it when present and valid. An unparseable or non-compiling schema is ignored (warned once). Validation still runs only when the port's _Validate Data_ toggle is on.

![Editor: configuring input and output validation schemas](/editor-schemas.png)

Ports can also carry **non-serializable** values (streams, class instances,
connections). Typing those with `SchemaType.Unsafe<T>()` is covered in
[Non-Data Ports](./non-data-ports).

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

type MyNodeInput = Input<Port<{ path: string }>>;
type MyNodeOutputs = Outputs<{ out: Port<{ url: string }> }>;

export default class MyNode extends IONode<
  Config,
  any,
  MyNodeInput,
  MyNodeOutputs,
  Settings
> {
  static override readonly settingsSchema = SettingsSchema;

  override async input(msg: MyNodeInput) {
    const endpoint = this.settings.apiEndpoint;
    this.send("out", { url: `${endpoint}${msg.path}` });
  }
}
```

Settings are validated once when the node type is first registered. They're accessed via `this.settings` with full type safety.

Setting keys in `settings.js` are prefixed with the camelCase version of the node type. For a node with `type = "my-node"`, the settings key `apiEndpoint` maps to `myNodeApiEndpoint` in the Node-RED settings file.

::: info Future changes
NRG currently uses [AJV](https://ajv.js.org/) for runtime schema validation. A future release may replace AJV with TypeBox's native validation and upgrade to [TypeBox v1](https://www.npmjs.com/package/typebox) (published as `typebox` on npm). This may introduce changes to schema definitions and validation behavior.
:::
