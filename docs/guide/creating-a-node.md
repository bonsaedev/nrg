# Creating a Node

This page covers the **node class** — its inputs and outputs, lifecycle hooks, context storage, and lifecycle output ports. A node's ports come from the class's **TypeScript types** (the `IONode` generics), not from its schemas.

See also:

- [Config schemas & fields](./form-fields) — schema field types, `x-nrg-form`, TypedInput, NodeRef, conditional validation, inferring the type.
- [The editor form](./editor-form) — the generated edit dialog, custom Vue forms, client-side files, and built-in form components.
- [Registration, config nodes, extending](./config-nodes) — registering the module, config nodes, and extending a published node.
- [Validation & inference](./schemas) — `defineSchema`, type inference, and input/output data validation.
- [The message model](./message-model) — the output envelope, context modes, the input root, and source nodes.

## Define the Node

Nodes are defined server-side and handle runtime logic. Create `src/server/nodes/my-node.ts`:

> Schemas live in `src/shared/schemas`; import them with the `@/schemas` alias — shipped in NRG's base tsconfig, build, and test configs, so `@/schemas/my-node` resolves with no setup.

```typescript
import {
  IONode,
  type RED,
  type Infer,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import {
  ConfigsSchema,
  CredentialsSchema,
  SettingsSchema,
} from "@/schemas/my-node";

export type Config = Infer<typeof ConfigsSchema>;
export type Credentials = Infer<typeof CredentialsSchema>;
export type Settings = Infer<typeof SettingsSchema>;

// Ports and wiring come from these two types — no input/output schema needed.
// The input is a port carrying a wire type; the output is one named port `out`.
type MyNodeInput = Input<Port<{ payload: string }>>; // → 1 input port
type MyNodeOutputs = Outputs<{ out: Port<{ greeting: string }> }>; // → 1 output port

export default class MyNode extends IONode<
  Config,
  Credentials,
  MyNodeInput,
  MyNodeOutputs,
  Settings
> {
  static override readonly type = "my-node";
  static override readonly category = "function";
  static override readonly color = "#a6bbcf";
  static override readonly configSchema = ConfigsSchema;
  static override readonly credentialsSchema = CredentialsSchema;
  static override readonly settingsSchema = SettingsSchema;

  static override async registered(RED: RED) {
    RED.log.info("my-node type registered");
  }

  override async created() {
    this.log(`Using endpoint: ${this.settings.apiEndpoint}`);
  }

  override async input(msg: MyNodeInput) {
    const apiKey = this.credentials?.apiKey;
    // send the port's value by name — the framework puts it at the `output` key
    // and keeps the incoming message under `input` (the default passthrough mode)
    this.send("out", { greeting: `${this.config.prefix}: ${msg.payload}` });
  }

  override async closed(removed?: boolean) {
    this.log(`Node closed (removed: ${removed})`);
  }
}
```

Want runtime data validation on top? That's a **config-schema framework control** (`SchemaType.InputSchema` / `SchemaType.OutputSchemas`) — it validates message data, it doesn't define the ports, and it is never a static on the class. See [Schema Validation](./schemas).

### Inputs and Outputs

A node's port **topology and wiring come from its types** — the `IONode` generics — not from schemas. There is no `inputs`/`outputs` property to set by hand.

```ts
class MyNode extends IONode<TConfig, TCredentials, TInput, TOutput, TSettings> {}
```

- **`TInput`** is the message your `input(msg)` handler receives. A **present** type gives the node **one input port** — and that includes `any`/`unknown`, for a config-driven node that is merely triggered and never reads `msg` directly. **`never`** (or `void`/`undefined`) means **no input** (a source node).
- **`TOutput`** is the node's output port(s), declared with [`Outputs<…>`](#declaring-output-ports-with-port). A single named port — `Outputs<{ out: Port<T> }>`, or `any`/`unknown` for a genuinely dynamic payload — is **one output port**; a record of several [`Port<T>`](#declaring-output-ports-with-port) markers is **multiple named ports**. Either way you emit by port name with `this.send(name, value)`. **`never`** means **no output** (a sink node).

**A port exists unless its generic is `never`** (or `void`/`undefined`). So `any` and `unknown` each make one untyped port; `never` is the single way to say "no port here".

| Generic | Ports |
| --- | --- |
| `TInput` is a real type, `any`, or `unknown` | 1 input port |
| `TInput` is `never` | 0 input ports (source node) |
| `TOutput` is a single type, `any`, or `unknown` | 1 output port |
| `TOutput` is `{ a: Port<A>; b: Port<B> }` | N named output ports |
| `TOutput` is `never` | 0 output ports (sink node) |

At build time NRG reads these generics and stamps the node's real port count and names, so the editor draws the right ports and can type-check wires between nodes (see [Extending a published node](./config-nodes#extending-a-published-node)). Schemas are **not** required for any of this.

<p align="center">
  <img alt="Port topology on the Node-RED canvas — source (Input=never) has no input port, trigger (Input=any) has one, route (named Port record) has two outputs, sink (Output=never) has no output" src="/port-topology-canvas.png" width="540"/>
</p>

::: tip The generics are compile-time only
`TInput` / `TOutput` are TypeScript-only. They shape the editor's ports, check your wires, and type your `input()` handler — but they **vanish when the code runs**. The `msg` your `input()` receives is exactly what the upstream node sent, unchecked; the framework never validates or converts it against `TInput`. If you need a specific runtime shape, convert it yourself — or turn on input data validation (a config-schema control) to _reject_ bad data: it rejects, it never rewrites. **Config** is different: it's validated and defaulted before you read it. See [config vs. message data](./schemas#validation-semantics).
:::

#### Declaring output ports with `Port<T>` {#declaring-output-ports-with-port}

A bare record type is ambiguous — `{ a: A; b: B }` could mean _one_ object port with fields `a`/`b`, or _two_ ports named `a`/`b`. The **`Port<T>`** marker removes the ambiguity: wrap each port's message type in `Port<…>`, hand the record to `Outputs<…>`, and NRG reads it as **named ports**.

```typescript
import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";

type Config = { name: string };
type PortNodeInput = Input<Port<{ payload: string }>>;
type PortNodeOutputs = Outputs<{
  ok: Port<{ value: number }>;
  err: Port<{ reason: string }>;
}>;

export default class PortNode extends IONode<Config, never, PortNodeInput, PortNodeOutputs> {
  static override readonly type = "port-node";
  static override readonly category = "function";
  static override readonly color = "#a6bbcf";

  override async input(msg: PortNodeInput) {
    this.send("ok", { value: msg.payload.length });
    //        ^^^^ autocompletes "ok" | "err"; the value is
    //             type-checked against that port's message type
  }
}
```

This node ships **no `inputSchema` or `outputSchemas`** — its one input port and two named output ports (`ok`, `err`) come entirely from the generics.

- A **single** output port is still a named port — `Outputs<{ rows: Port<number[]> }>` is one port, emitted with `this.send("rows", rows)`.
- `send(name, value)` autocompletes the port name and checks `value` against that port's `Port<T>`. You can also send by numeric index (`send(0, …)`), in record order.
- `Port`, `Input`, and `Outputs` are **type-only** markers (erased at runtime), exported from `@bonsae/nrg/server`.

#### Topology is types-only {#schema-driven-topology}

Topology is **types-only** — the build extracts a node's `Input`/`Output` generics and stamps the port count and names straight from them. There is **no** schema fallback: an input/output data-validation schema never creates or names a port.

::: tip JavaScript authors
Generics are a TypeScript feature, and type extraction runs only over `.ts` at build time (there is no `allowJs` extraction today), so a plain-JS node can't declare typed topology. Author your nodes in TypeScript to get ports from the `Input`/`Output` generics.
:::

For ports that carry **non-data** values (a function, class instance, `Buffer`, stream, or connection), a plain type already works — there is nothing to validate. If you _do_ write an output schema, use `SchemaType.Unsafe<T>()` to type such a field without validating it. See [Non-Data Ports](/guide/non-data-ports).

#### Named Output Ports

You get named output ports from a `Port<T>` record wrapped in `Outputs<…>`. Port names appear as labels in the editor and `send()` gets full autocomplete and per-port type safety. The example below passes an `Outputs<…>` generic whose keys are `Port<T>` markers:

```typescript
import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { ConfigsSchema, type Config } from "@/schemas/router";

type Success = { ok: true; id: string };
type Failure = { reason: string };
type RouterInput = Input<Port<{ payload: unknown }>>;
type RouterOutputs = Outputs<{ success: Port<Success>; failure: Port<Failure> }>;

export default class Router extends IONode<Config, any, RouterInput, RouterOutputs> {
  static override readonly type = "router";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: RouterInput) {
    try {
      const result = await process(msg);
      // Type-safe: the value must match the "success" port's type
      this.send("success", { ok: true, id: result.id });
      //        ^^^^^^^^^ autocompletes: "success" | "failure"
    } catch (err) {
      // Type-safe: the value must match the "failure" port's type
      this.send("failure", { reason: String(err) });
    }
  }
}
```

You can also send by numeric index — port order follows the `Outputs` record's key order:

```typescript
this.send(0, msg); // same as this.send("success", msg)
this.send(1, msg); // same as this.send("failure", msg)
```

Whichever form you use, the first argument is always the port — its name or its
index. There is no positional object or tuple overload; `send()` addresses one
port per call.

::: tip When to use named ports
Use named ports whenever your node has multiple outputs with distinct purposes. The port names provide self-documenting labels in the editor and `send()` gives you per-port type safety — you can't accidentally send a success message to the failure port.
:::

::: warning Reserved port names
The names `"error"`, `"complete"`, and `"status"` are reserved for built-in ports and cannot be used as port names (keys in the `Outputs` record). Use descriptive alternatives like `"failed"` instead of `"error"`. `send()` only works with user-defined output ports — built-in ports are managed by the framework through `this.status()`, `this.error()`, and automatic completion.
:::

### Static Properties

| Property | Required | Description |
| --- | --- | --- |
| `type` | Yes | Unique node type identifier |
| `category` | Yes | Palette category (e.g., `"function"`, `"network"`, `"config"`) |
| `color` | Yes | Node color in hex format (e.g., `"#a6bbcf"`) |
| `configSchema` | No | TypeBox schema for config validation |
| `credentialsSchema` | No | TypeBox schema for credential fields |
| `settingsSchema` | No | Schema for Node-RED runtime settings |
| `align` | No | `"left"` or `"right"` alignment |

### Lifecycle Hooks

| Hook | When Called |
| --- | --- |
| `created()` | After the node instance is constructed |
| `input(msg)` | When the node receives a message (IONode only) |
| `closed(removed?)` | When the node is stopped or deleted |
| `static registered(RED)` | Once when the node type is first registered |

### Available Methods

| Method | Description |
| --- | --- |
| `this.send(port, value)` | Send `value` out of a user-defined output port, addressed by name or index. The framework wraps it as `{ <returnProperty>: value, source: { id, type, name, port }, input: msg }`; how deep the incoming history is kept under `input` is resolved per output port (default `passthrough`) — see [Context modes](./message-model#context-modes). Built-in ports (error, complete, status) are not allowed — they are managed by the framework. |
| `this.status({ fill, shape, text })` | Set the node's status indicator |
| `this.log(msg)` | Log an info message |
| `this.warn(msg)` | Log a warning |
| `this.error(message, msg?)` | Log an error; pass the `msg` object to also emit the [error port](#lifecycle-output-ports) |
| `this.i18n(key)` | Get a translated string |
| `this.config.<prop>.resolve(msg?)` | Resolve a TypedInput value |
| `this.setTimeout(fn, ms)` | Auto-cleared timeout |
| `this.setInterval(fn, ms)` | Auto-cleared interval |
| `this.context.node` / `.flow` / `.global` | Context storage — `get`/`set`/`keys` plus atomic `increment`/`update`. See [Context storage](#context-storage). |

### Context storage

`this.context` is a promise-based view of Node-RED's `node` / `flow` / `global`
context stores. Use the scope accessors (or the function form for a named store):

```typescript
await this.context.node.set("lastSeen", Date.now());
const seen = await this.context.node.get("lastSeen");
const keys = await this.context.flow.keys();
const cfg = await this.context("global", "file").get("config"); // function form + named store
```

#### Atomic counters & read-modify-write {#atomic-context}

`get` + `set` is **last-write-wins**: if two messages read a value, change it, and
write it back concurrently, one update is silently lost. For counters and
accumulators, use the atomic methods instead — they keep the read-modify-write in
one operation:

```typescript
const visits = await this.context.flow.increment("visits");   // +1, returns the new value
await this.context.global.increment("bytes", msg.payload.length); // add N
await this.context.flow.update("ids", (cur) => [...(cur ?? []), msg.id]);
```

- **`increment(key, by = 1)`** — atomically add to a numeric key; returns the new value.
- **`update(key, fn)`** — atomic read-modify-write; `fn(current)` returns the next value.
  `fn` **may run more than once** on a write conflict, so it must be **pure** (no
  side effects — do I/O outside `update`).

::: tip Why this matters
Use `increment` / `update` whenever two messages might touch the same value at
once: `get`+`set` can silently drop one of the changes, these can't. With a plain
in-memory or file store, that safety holds **within this Node-RED process**. Some
stores (Redis, DynamoDB) implement these natively, so the safety holds even
**across separate servers**. `get`+`set` can't give you this: the "modify" happens
in your node, outside the store, so there's nothing to serialize it against.
(Advanced: this is what you need when a flow runs on more than one instance — HA
mode, or compiled to a stateless target like AWS Lambda.)
:::

### Lifecycle Output Ports {#lifecycle-output-ports}

By default, Node-RED routes errors, completions, and status changes through implicit `catch`, `complete`, and `status` nodes. These work without wires — you drop them on the canvas and configure their scope separately — so these events never appear in the visual data flow.

NRG turns these into explicit output ports. Turn one on and that event is sent down a wire like any other message, so it shows up in the flow. One difference: the **error** port, when enabled, becomes the _sole_ error handler — the error travels its wire and no longer triggers Node-RED's `catch` nodes. The **complete** and **status** ports are additive: they fire _alongside_ Node-RED's built-in complete/status nodes (see the note at the end of this section).

**You don't declare these in your schema.** The framework injects the `errorPort`, `completePort`, and `statusPort` controls into **every** IONode's config, so a **Lifecycle Output Ports** section (see [The editor form](./editor-form#the-editor-form)) with an Error / Complete / Status toggle renders on every node automatically. Each defaults to **off**, and the **flow author** enables the ones they want, per node instance — that toggle value is what makes the port appear. Nothing in your schema controls whether a port renders.

#### Changing a default

The only reason to name one of these in your config schema is to change its **default** for your node type. Declare just that field with the default you want; the framework merges your value over its own:

```typescript
export const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    url: SchemaType.String({ default: "" }),
    // ... your node-specific config

    // Default the error port ON for this node type (framework default is off).
    // The flow author can still toggle it off per instance.
    errorPort: SchemaType.Boolean({ default: true }),
  },
  { $id: "my-node:config" }
);
```

Declaring it does **not** add or gate the port — the toggle is always there; you're only seeding what it starts as.

#### How it works

When a user enables a built-in port, an extra output is appended to the node:

| Property | Trigger | Output message |
| --- | --- | --- |
| `errorPort` | A thrown/uncaught error in `input()`, or `this.error(message, msg)` called with a message object — `this.error(message)` without the `msg` argument only logs and does **not** emit to the error port | `{ error: { name, message, stack? }, source: { id, type, name }, input: <incoming msg> }` — the error data is in `error`; `source` (producing node) and the failing message (`input`) ride the root beside it; plus any own fields of a thrown custom `Error` ([see below](#throwing-a-custom-error)) |
| `completePort` | `input()` finishes successfully | `{ complete: <return value>, source: { id, type, name }, input: <incoming msg> }` — `source`/`input` at the root; the `complete` key carries `input()`'s return value when there is one (a `void` return omits it — arrival on the wire is the signal) ([see below](#returning-a-custom-completion-message)) |
| `statusPort` | Every `this.status()` call | `{ status: { fill, shape, text }, source: { id, type, name } }` |

Extra ports are always appended **after** the node's data ports, in a fixed order: error, complete, status. This means existing wires are never broken when toggling a port on or off.

```
Port 0: Data output 1
Port 1: Data output 2
Port 2: Error        (if errorPort enabled)
Port 3: Complete     (if completePort enabled)
Port 4: Status       (if statusPort enabled)
```

These built-in port messages are **typed**. `@bonsae/nrg/server` exports `ErrorPort<TInput, TError>`, `CompletePort<TInput, TReturn>`, and `StatusPort` — the error and complete shapes are generic over the node's input message (and, for complete, `input()`'s return value), so a downstream handler sees the original message under `input`, the `source` provenance, and any custom fields. NRG feeds these into the generated `NodeTypes` registry, so the editor can type-check a wire coming off a built-in port too.

#### Framework config fields {#framework-config-fields}

The framework knows a set of config fields by name and **injects them into every IONode's config schema by the build**: `name`, the three lifecycle-port toggles, `outputReturnProperties`, `outputContextModes`, and the data-validation fields (`inputSchema`, `outputSchemas`, and their `validate` toggles). Their editor controls render on every node whether or not you declare them. Each has a **framework default** (ports off, context mode `passthrough`, return key `output`, no validation schema), and the **flow author chooses per instance** whether to use it. You never build these form fields yourself.

As a node **author you declare one of these only to change its default** — add the property to your config schema and set your value on the builder's `default`. That value becomes the seeded default in the editor (which the flow author can still change); declaring does **not** change whether the control appears — it always does.

That includes the two data-validation rows below. `inputSchema` and `outputSchemas` are injected like the rest, so the **Validate Data** controls render on every node regardless; declaring one only seeds a default schema value — it does not make the editor appear. (The per-port Schema editor becomes available once the flow author toggles Validate Data on.)

| Property | Builder | Controls (framework default) |
| --- | --- | --- |
| `name` | `SchemaType.String` | The node's display name (default: empty) |
| `errorPort` | `SchemaType.Boolean` | The built-in [error port](#lifecycle-output-ports) (default: off) |
| `completePort` | `SchemaType.Boolean` | The built-in [complete port](#lifecycle-output-ports) (default: off) |
| `statusPort` | `SchemaType.Boolean` | The built-in [status port](#lifecycle-output-ports) (default: off) |
| `outputReturnProperties` | `SchemaType.OutputReturnProperties` | Per-port key each emitted value is wrapped under (default: `output`) |
| `outputContextModes` | `SchemaType.OutputContextModes` | Per-port `passthrough` / `reset` of the incoming message (default: `passthrough`) |
| `inputSchema` | `SchemaType.InputSchema` | A flow-author-editable input data-validation schema (default: none) |
| `outputSchemas` | `SchemaType.OutputSchemas` | Flow-author-editable per-port output data-validation schemas (default: none) |

**Changing the defaults.** Add the property to your config schema with your value — one example for each:

```typescript
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

export const ConfigsSchema = defineSchema(
  {
    // A default display name for new instances of this node.
    name: SchemaType.String({ default: "HTTP request" }),

    // Turn built-in ports ON by default (they are off unless you declare them).
    errorPort: SchemaType.Boolean({ default: true }),
    completePort: SchemaType.Boolean({ default: true }),
    statusPort: SchemaType.Boolean({ default: false }),

    // Wrap output port 0's value under `result` instead of the default `output`.
    outputReturnProperties: SchemaType.OutputReturnProperties({
      default: { 0: "result" },
    }),

    // Seed output port 0's dropdown to `reset` instead of `passthrough`. (Every
    // port's Context Mode dropdown is always editable by the flow author; `default`
    // only changes which value a port starts on — ports you leave out start on
    // `passthrough`.)
    outputContextModes: SchemaType.OutputContextModes({
      default: { 0: "reset" },
    }),

    // Ship a default input validation schema the flow author can override.
    inputSchema: SchemaType.InputSchema({
      default: JSON.stringify({
        type: "object",
        properties: { payload: { type: "string" } },
        required: ["payload"],
      }),
    }),

    // Ship a default validation schema for output port 0. Only ports given a
    // default here are overridable by the flow author in the editor.
    outputSchemas: SchemaType.OutputSchemas({
      default: {
        0: JSON.stringify({
          type: "object",
          properties: { result: { type: "string" } },
        }),
      },
    }),
  },
  { $id: "http-client:config" },
);
```

Leave a property out entirely and the node simply uses its framework default. The `validate*` toggles that pair with `inputSchema` / `outputSchemas` are added and managed by the editor's Ports Settings — you don't declare them yourself. See [configuring validation in the editor](./schemas#editor-schema-overrides) for the override flow.

#### Returning a custom completion message {#returning-a-custom-completion-message}

The complete port normally carries a plain "done" signal — just `source` and
`input` at the root. If your `input()` handler **returns a value**, that value
rides the complete port under the **`complete`** key, and the flow continues with
it. Returning nothing (or `undefined`) omits the `complete` key entirely (arrival
on the complete wire is itself the signal), so this is backward-compatible.

```typescript
override async input(msg: Input<Port<{ items: unknown[] }>>): Promise<Summary> {
  const results = await Promise.all(this.collect(msg));
  // continues on the complete port as
  //   { complete: <summary>, source, input: msg }
  return summarize(results);
}
```

This makes the complete port author-controllable, symmetric with the error port
(`throw` / `this.error()`) and status port (`this.status()`). It's the natural fit
for a node that **awaits work and yields a single result on completion** rather
than emitting per-message on a data port (e.g. a gather/aggregate node). `input()`'s
return type is `unknown` by default; declare a stricter return (as above) to type
the value. Requires `completePort` enabled.

#### Throwing a custom error {#throwing-a-custom-error}

The `error` block always carries the error's `name` and `message` (plus `stack`
when you `throw` an `Error`). If you **throw a custom `Error` subclass**, its own
enumerable properties are merged in too, so a downstream flow can route and react
on structured detail instead of parsing a string — `name`, `message`, and `stack`
are layered last, so they stay authoritative over anything you add. `msg.error`
sits at the root (with `source` and `input` beside it) — the same place a Node-RED
**Catch** node puts it — so a node reading it feels familiar; but the error travels
the port's wire, it does **not** trigger Catch nodes (the port is the sole handler).

```typescript
class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("rate limited");
    this.name = "RateLimitError"; // set name explicitly — subclasses don't
  }
}

override async input(msg: Input<Port<{ payload: unknown }>>) {
  throw new RateLimitError(2000);
  // error port: { error: { name: "RateLimitError", message: "rate limited",
  //                        stack: "…", retryAfterMs: 2000 }, source, input: msg }
}
```

Notes: `name` and `message` are always included (plus `stack` when you `throw` an
`Error`) — nrg adds them explicitly, because they're non-enumerable on an `Error`
and a plain spread would miss them. Only the **enumerable own** properties of your
thrown error are merged in on top, so set any *extra* data as enumerable instance
properties and keep it serializable (the block is flattened to plain data, so it
survives `cloneMessage` and `JSON`). Discriminate on `error.name` (realm-safe)
rather than `instanceof`. Requires `errorPort` enabled.

#### Example: node with error and status ports

```typescript
import { IONode, type Infer, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

const ConfigsSchema = defineSchema(
  {
    name: SchemaType.String({ default: "" }),
    url: SchemaType.String({ default: "" }),
    errorPort: SchemaType.Boolean({ default: false }),
    statusPort: SchemaType.Boolean({ default: false }),
  },
  { $id: "http-client:configs" }
);

type Config = Infer<typeof ConfigsSchema>;
type HttpClientInput = Input<Port<Record<string, unknown>>>; // one input port
type HttpClientOutputs = Outputs<{ out: Port<unknown> }>; // one (untyped) output port

export default class HttpClient extends IONode<Config, any, HttpClientInput, HttpClientOutputs> {
  static override readonly type = "http-client";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: HttpClientInput) {
    this.status({ fill: "green", shape: "dot", text: "requesting..." });
    const response = await fetch(this.config.url);
    this.status({ fill: "green", shape: "dot", text: "done" });
    this.send("out", await response.json());
  }
}
```

If the user enables both `errorPort` and `statusPort`, the node gets 3 outputs: data (port 0), error (port 1), and status (port 2). If they leave both off, the node has a single output as usual.

::: tip Error port replaces Catch; complete/status run alongside
The **complete** and **status** ports work _alongside_ Node-RED's built-in `complete` and `status` nodes — enabling a port doesn't disable the implicit behavior, both fire. The **error** port is different: when it is enabled it becomes the **sole** error handler, so a thrown error (or `this.error(message, msg)`) travels its wire and does **not** also trigger Node-RED `catch` nodes — routing to both would report the same error twice and stamp a second, differently-shaped error onto the message. Node-RED's `catch` mechanism is the fallback **only when a node has no error port**. (A framework misuse — e.g. `send("error", …)` to a reserved built-in port — is a developer bug, not runtime data, so it always surfaces loudly regardless of the error port.)
:::
