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

Then define a node by extending `IONode`. Port topology comes from the `Input`/`Output` type generics; the config schema drives the editor form and validation:

**src/server/nodes/http-request.ts**

```typescript
import { IONode, type Infer, type Port } from "@bonsae/nrg/server";
import { Readable } from "node:stream";
import { ConfigsSchema, RequestSchema } from "@/schemas/http-request";

type Config = Infer<typeof ConfigsSchema>;
type Input = Infer<typeof RequestSchema>; // ← input type inferred from a schema

type Output = {
  body: Port<Readable>; // ← named port, non-data, no schema
  failed: Port<{ status: number; message: string }>;
};

export default class HttpRequest extends IONode<Config, never, Input, Output> {
  static override readonly type = "http-request";
  static override readonly configSchema = ConfigsSchema;

  override async input(msg: Input) {
    const res = await fetch(`${this.config.baseUrl}${msg.path}`);
    if (!res.ok) {
      this.sendToPort("failed", { status: res.status, message: res.statusText });
      return;
    }
    this.sendToPort("body", Readable.fromWeb(res.body!)); // the stream, not its bytes
  }
}
```

See the [documentation](https://bonsaedev.github.io/nrg) for the full walkthrough — schemas, the generated editor form, testing, and building — or the [node-red-salesforce](https://github.com/bonsaedev/node-red-salesforce) repo for a real-world reference.

## License

MIT
