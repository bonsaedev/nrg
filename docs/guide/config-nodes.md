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

`defineModule` creates a typed module manifest that NRG uses to register your nodes with Node-RED. Use it instead of exporting a plain object — it provides type checking on the `nodes` array and will support additional fields (like `plugins`) in future releases.

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

The build also augments `@bonsae/nrg/server`'s `NodeTypes` registry with every node's port types, keyed by node-type string. Because each installed package merges into the same registry, the editor can type-check a wire between nodes from _different_ packages. See [the generated `index.d.ts`](./project-structure#dist) for the full type surface.
