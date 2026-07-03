import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import type { Infer as ServerInfer } from "@/sdk/lib/server/schemas/types";
import type { Infer as ClientInfer } from "@/sdk/lib/client/types";

// Never executed — `tsc` (via `pnpm validate:tsc`) proves that a class instance
// passed through `SchemaType.Unsafe<T>()` resolves back to `T` UNCHANGED on both
// planes. Before the `UnsafeBrand` brand, the per-plane resolvers deep-mapped
// the class into a structural object and dropped its private/`#` members, so the
// result was no longer assignable to the class (TS2741) — silently breaking the
// documented connection/stream/Buffer use case.

class Connection {
  #handle = 1;
  query(sql: string): Promise<unknown> {
    void sql;
    void this.#handle;
    return Promise.resolve();
  }
}

const ConfigSchema = defineSchema(
  {
    conn: SchemaType.Unsafe<Connection>(),
    conns: SchemaType.Array(SchemaType.Unsafe<Connection>()),
    plain: SchemaType.Unsafe<{ a: number }>(),
  },
  { $id: "unsafe-probe:configs" },
);

// --- server plane: Unsafe<Connection> stays Connection (private # preserved) ---
function serverProof(c: ServerInfer<typeof ConfigSchema>) {
  const conn: Connection = c.conn;
  void conn;
  void c.conn.query("select 1");
  const arr: Connection[] = c.conns;
  void arr;
  const a: number = c.plain.a;
  void a;
  // @ts-expect-error a Connection is not a plain { handle: number }
  const bad: { handle: number } = c.conn;
  void bad;
}
void serverProof;

// --- client plane: Unsafe<T> is T on the client too ---
function clientProof(c: ClientInfer<typeof ConfigSchema>) {
  const conn: Connection = c.conn;
  void conn;
  void c.conn.query("select 1");
}
void clientProof;
