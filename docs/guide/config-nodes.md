# Registration, Config Nodes & Extending

Registering your node with Node-RED, defining shared config nodes, and extending a published node from another package.

## Register the Node

Export all nodes from `src/server/index.ts` using `defineModule`:

```typescript
import { defineModule } from "@bonsae/nrg/server";
import MyNode from "./nodes/my-node";

export default defineModule({
  nodes: [MyNode],
});
```

`defineModule` creates a typed module manifest that NRG uses to register your nodes with Node-RED. Use it instead of exporting a plain object — it provides type checking on the `nodes` array and may support additional fields in future releases.

## Config Nodes

To create a configuration node (e.g., a server connection), extend `ConfigNode`:

```typescript
import { ConfigNode } from "@bonsae/nrg/server";
import { ConfigsSchema, type Config } from "@/schemas/remote-server";

export default class RemoteServer extends ConfigNode<Config> {
  static override readonly type = "remote-server";
  static override readonly configSchema = ConfigsSchema;

  override async created() {
    // Initialize connection
  }

  override async closed() {
    // Cleanup connection
  }
}
```

Config nodes have `category` set to `"config"` and expose:

- `this.userIds` — array of IDs of nodes using this config
- `this.users` — array of node instances using this config
- `this.getUser(index)` — get a specific user node by index

## Extending a published node

The class API compiles to real, inheritable class declarations in your package's `index.d.ts`, so another package can install yours, import a node class, and extend it — with the base schema, ports, and types all carried over:

```typescript
import { HttpClient } from "some-published-nrg-package";

export default class AuthedHttpClient extends HttpClient {
  // add or override behavior; the inherited schema and port types stay intact
}
```

The generated `index.d.ts` (produced via API Extractor from the built barrel) exposes each node as an inheritable, type-only class declaration with its port types intact, alongside the `{ nodes: [...] }` module default — so a consumer can import and extend a node class with its schema and port types carried over. Config nodes have no wireable ports, so they simply contribute an inheritable class declaration and nothing to wiring. See [the generated `index.d.ts`](./project-structure#dist) for the full type surface.

Because each installed package's node port types are available to the compiler, the deploy-only [wire check](./message-model#the-wire-check) — run on every deploy in `nrg dev` across the whole flow — validates wires between nodes from _different_ packages, pushing per-connection verdicts to the editor so it paints failing wires red.
