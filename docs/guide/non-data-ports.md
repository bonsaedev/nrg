# Non-Data Ports (Streams, Instances, Connections)

Ports usually carry plain JSON. But a port can also carry a **non-serializable**
value — a stream, a class instance, a `Buffer`, or a live connection. This page
covers how to type such ports with `SchemaType.Unsafe<T>()` and how the framework
passes them through intact. It's advanced; skip it until you build a node that
moves live objects between ports.


Not every port carries plain data. A node might emit a function, a class
instance, a `Buffer` or stream, or a database client — or accept a message with
non-serializable parts. A port's **type** comes from the `Input`/`Output`
generic, so a non-data value just needs a plain type — there is nothing to
validate:

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

  override async input() {
    this.send("out", { connection: pool, rowCount: 0 }); // pool passes through intact
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
import { IONode, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { Readable } from "node:stream";

type FetchStreamInput = Input<Port<{ url: string }>>;
type FetchStreamOutputs = Outputs<{ body: Port<Readable> }>;

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
    // Send the Readable itself — the wire moves the STREAM object, not its
    // bytes. A downstream node receives this exact instance and can `.pipe()` it.
    this.send("body", Readable.fromWeb(res.body!));
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
clone, like a live socket or stream, should ride the [private channel](./message-channels)
instead. See [The Message Model](./message-model#sends-merge-named-fields).
