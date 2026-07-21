# Non-Data Ports (Streams, Instances, Connections)

Ports usually carry plain JSON. But a port can also add a **non-serializable**
field to the message — a stream, a class instance, a `Buffer`, or a live
connection. You type such a field the same way as any other: **directly on the
`Port`** (`Port<{ body: Readable }>`) — the type comes from the `Input`/`Output`
generic, and no schema is involved. A schema is optional here, needed only if you
additionally want runtime validation on the plain-data fields alongside it; that's
the `SchemaType.Unsafe<T>()` case, covered near the end. It's advanced; skip this
page until you build a node that moves live objects between nodes.

> A live/non-serializable value survives a **single wire** by reference but not a
> **fan-out** clone. A connection, stream, or socket that must reach several
> downstream nodes can't ride the message across a fan-out — keep it in an
> out-of-band store keyed off the message id and have each node read it back by
> that id.

Not every port adds plain data. A node might add a function, a class
instance, a `Buffer` or stream, or a database client to the record — or accept a
message with non-serializable parts. A port adds one or more **named fields** to
the flow's accumulating record, and each field's **type** comes from the
`Input`/`Output` generic — so a non-data field just needs a plain type as one
property of the output schema; there is nothing to validate:

```typescript
import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";

type Connection = { query(sql: string): Promise<unknown[]> };
type OpenConnectionInput = Input<Port<{ payload: unknown }>>;
type OpenConnectionOutputs = Outputs<{
  out: Port<{ connection: Connection; rowCount: number }>;
}>;

export default class OpenConnection extends IONode<
  Config,
  any,
  OpenConnectionInput,
  OpenConnectionOutputs
> {
  static override readonly type = "db-open";
  static override readonly configSchema = ConfigsSchema;

  #pool!: Connection;

  override async created() {
    // Open the live connection once, when the node is deployed.
    this.#pool = await openPool(this.config);
  }

  override async input(msg: OpenConnectionInput) {
    // The live pool is a non-data value — it rides a single wire intact by
    // reference. This is safe only on a single hop; a live pool does NOT survive
    // a fan-out clone. A handle that must reach several nodes across a fan-out
    // has to live in an out-of-band store keyed off the message id, not on msg.
    this.send("out", { connection: this.#pool, rowCount: 0 });
  }
}
```

The build reads the `Output` generic, so the generated node help renders the
**Output** table with `connection` typed as `Connection` and `rowCount` as
`number` — recovered from the source at build time, with nothing to keep in sync
by hand.

The wire carries the **actual object**, not a copy — on a single downstream wire
the framework passes the message by reference and never deep-clones it, so a live
stream or an HTTP request/response travels intact on that one hop (a fan-out is
different — see below). A node can emit a `Readable` on a typed
port:

```typescript
import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { Readable } from "node:stream";

type FetchStreamInput = Input<Port<{ url: string }>>;
type FetchStreamOutputs = Outputs<{ body: Port<{ body: Readable }> }>;

export default class FetchStream extends IONode<
  Config,
  any,
  FetchStreamInput,
  FetchStreamOutputs
> {
  static override readonly type = "fetch-stream";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: FetchStreamInput) {
    const res = await fetch(msg.url);
    // Name the `body` field — `send` merges this object onto the accumulating
    // record. The wire moves the STREAM object, not its bytes: the exact
    // `Readable` instance is set on `msg.body`, so a downstream node reads
    // `msg.body` and can `.pipe()` it.
    this.send("body", { body: Readable.fromWeb(res.body!) });
  }
}
```

`Port<{ body: Readable }>` type-checks the wire in the editor — it only connects
to a node whose input reads `msg.body` as a `Readable`. The same pattern carries an HTTP request/
response pair (`Port<{ req: IncomingMessage; res: ServerResponse }>`), a
`Buffer`, a socket, or any class instance: nrg nodes compose like typed function
calls that pass real objects around, not just JSON hand-offs.

If you additionally want **runtime data validation** on the data fields (via the
`SchemaType.OutputSchemas()` config control — see
[Configuring validation in the editor](./schemas#editor-schema-overrides)), JSON Schema
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
| `SchemaType.Any()` | no | `any` | a truly untyped value that flows through unchecked |
| `SchemaType.Unknown()` | no | `unknown` | force the consumer to narrow before use |
| `SchemaType.Unsafe<T>({ …json… })` | yes | `T` | a custom/branded static type **with** real validation |

Prefer `Unsafe<T>()` over `Any()` for non-data ports — both skip validation, but
`Unsafe<T>()` keeps full type safety on the outgoing record and the input message. Reach
for it rather than `SchemaType.Function`/`Constructor` too: those emit a non-JSON
`type` keyword that only validates cleanly when the schema is built with
`defineSchema` (which strips it via `markNonValidatable`), whereas `Unsafe<T>()`
is already an empty schema with nothing for AJV to choke on.

Node-RED passes the message to a **single** downstream wire by reference, so these
non-data values reach the next node intact on one connection. On a fan-out
(multiple wires) Node-RED deep-clones the message — a value that can't survive a
clone, like a live socket or stream, can't travel on `msg` to several nodes at
once; keep it in an out-of-band store keyed off the message id and read it back
by that id. See [The Message Model](./message-model#sends-merge-named-fields).
