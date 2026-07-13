<p align="center">
  <img alt="nrg-icon" src="https://gist.githubusercontent.com/AllanOricil/bad08acfef9f693e6cc28ec82b151672/raw/8118f6022bd5ccdce066abc398611b2a8aa93e81/nrg-icon-banner.svg"/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bonsae/nrg"><img src="https://img.shields.io/npm/v/@bonsae/nrg.svg" alt="npm package"></a>
  <a href="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml"><img src="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://codecov.io/gh/bonsaedev/nrg"><img src="https://codecov.io/gh/bonsaedev/nrg/graph/badge.svg" alt="codecov"/></a>
  <a href="https://socket.dev/npm/package/@bonsae/nrg"><img src="https://badge.socket.dev/npm/package/@bonsae/nrg?v=1" alt="Socket Badge"></a>
</p>

> [!WARNING]
> While **NRG** is at `v0`, breaking changes can land in any release and will **not** bump the major version. Pin an exact version and review the release notes before upgrading.

# NRG

Build Node-RED nodes with Vue 3, TypeScript, JSON Schemas, Vite and Vitest.

## Quick Start

Scaffold a new project with everything wired up:

```bash
pnpm create @bonsae/nrg
```

A node is a **config schema** (drives the editor form + validation) and a **class** (the logic). Here's a full `http-request` node — every method, custom headers, a timeout, and a chosen response type:

**src/shared/schemas/http-request.ts**

```typescript
import { SchemaType, defineSchema } from "@bonsae/nrg/schema";

export const ConfigsSchema = defineSchema(
  {
    method: SchemaType.Union(
      [
        SchemaType.Literal("GET"),
        SchemaType.Literal("POST"),
        SchemaType.Literal("PUT"),
        SchemaType.Literal("PATCH"),
        SchemaType.Literal("DELETE"),
        SchemaType.Literal("HEAD"),
      ],
      { default: "GET", description: "HTTP method.", "x-nrg-form": { icon: "exchange" } },
    ),
    baseUrl: SchemaType.String({ default: "", description: "Prepended to the message's path.", "x-nrg-form": { icon: "globe" } }),
    headers: SchemaType.String({ default: "", description: "One per line, as `Name: value`.", "x-nrg-form": { icon: "list-alt" } }),
    timeout: SchemaType.Number({ default: 30000, description: "Abort after N milliseconds.", "x-nrg-form": { icon: "clock-o" } }),
    returnType: SchemaType.Union(
      [SchemaType.Literal("stream"), SchemaType.Literal("text"), SchemaType.Literal("json")],
      { default: "stream", description: "How to read the response body.", "x-nrg-form": { icon: "sign-out" } },
    ),
  },
  { $id: "HttpRequestConfigsSchema" },
);
```

**src/server/nodes/http-request.ts**

```typescript
import { IONode, type Infer, type Input, type Outputs, type Port } from "@bonsae/nrg/server";
import { Readable } from "node:stream";
import { ConfigsSchema } from "@/schemas/http-request";

type Config = Infer<typeof ConfigsSchema>;
type HttpRequestInput = Input<Port<{ path: string; body?: unknown }>>;
type HttpRequestOutputs = Outputs<{
  response: Port<{ status: number; body: unknown }>;
}>;

export default class HttpRequest extends IONode<Config, any, HttpRequestInput, HttpRequestOutputs> {
  static override readonly type = "http-request";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: HttpRequestInput) {
    const { method, baseUrl, headers, timeout, returnType } = this.config;

    const res = await fetch(`${baseUrl}${msg.path}`, {
      method,
      headers: Object.fromEntries(headers.split("\n").filter(Boolean).map((h) => h.split(": "))),
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(msg.body),
      signal: AbortSignal.timeout(timeout),
    });

    // A network error or timeout throws — nrg routes it to the built-in Error
    // port. Any HTTP response (2xx–5xx) is a normal result; its status rides along.
    const body =
      returnType === "json" ? await res.json() : returnType === "text" ? await res.text() : Readable.fromWeb(res.body!);

    this.send("response", { status: res.status, body });
  }
}
```

You wrote **no editor HTML, no jQuery, no `oneditprepare`** — nrg generates the entire edit dialog from the schema and types above: the `method` and `returnType` unions become dropdowns, strings and numbers become validated inputs, and the input/output ports and lifecycle wiring come for free.

A classic Node-RED node hand-writes hundreds of lines of HTML for its edit form and keeps it in sync with the runtime by hand. Here it's derived from your schema and types — so it can't drift, and every field is validated for free.

See the [documentation](https://bonsaedev.github.io/nrg) for the full walkthrough — schemas, the generated editor form, testing, and building — or the [node-red-salesforce](https://github.com/bonsaedev/node-red-salesforce) repo for a real-world reference.

## License

MIT
