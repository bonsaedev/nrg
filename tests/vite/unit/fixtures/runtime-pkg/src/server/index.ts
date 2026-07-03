// Unlike convention-pkg, this registry imports the real server runtime barrel
// — which constructs an AsyncLocalStorage at module load (via io-node) and is
// the kind of import that CRASHED in the browser. loadRegistry must import it
// safely in the Node globalSetup context. Also exercises alias resolution
// inside the dynamic import.
import { IONode } from "@/core/server";
import { defineSchema, SchemaType } from "@/core/shared/schemas";

// Reference the barrel so the import is not elided, proving the runtime module
// (and its module-load AsyncLocalStorage) actually loads.
void IONode;

class RuntimeNode {
  static type = "runtime-node";
  static configSchema = defineSchema(
    {
      name: SchemaType.String({ minLength: 1 }),
    },
    { $id: "index:1" },
  );
}

export default { nodes: [RuntimeNode] };
