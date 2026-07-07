import { describe, it, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { SchemaType } from "@/sdk/lib/shared/schemas";
import { createNode } from "@/sdk/test/server/unit";
import type { Infer as ServerInfer } from "@/sdk/lib/server/schemas/types";
import type { Infer as ClientInfer } from "@/sdk/lib/client/types";
import NodeRefProbe, {
  BrokerConfig,
  ConfigSchema,
} from "../fixtures/node-ref-typing-test/node-ref-probe";

// These proofs are never executed — they exist so `tsc` (run via
// `pnpm validate:tsc`) proves the unified `SchemaType.NodeRef<T>("type")` form
// keeps server IntelliSense (the field resolves to the referenced node
// *instance*) while the client resolves the same field to the node-id `string`.
// The runtime arg to `NodeRef` is just the `type` string.
//
// The server-plane `this.config.broker` → instance proof lives INSIDE the fixture
// node's `input()`; the node is TYPES-ONLY (its topology comes from the generics,
// not a schema). Point the topology extractor at the fixture tree so `createNode`
// behaves exactly as the build does — mirroring the sibling port-topology proofs.
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/node-ref-typing-test", import.meta.url),
);

// --- server plane via `Infer` ----------------------------------------------
type ServerConfig = ServerInfer<typeof ConfigSchema>;
function serverProof(c: ServerConfig) {
  c.broker.connect();
  const name: string = c.name;
  void name;
  // @ts-expect-error server-resolved ref is the instance, not a string
  const bad: string = c.broker;
  void bad;
}
void serverProof;

// --- client plane: the same ref resolves to the node-id STRING --------------
type ClientConfig = ClientInfer<typeof ConfigSchema>;
function clientProof(c: ClientConfig) {
  const brokerId: string = c.broker;
  void brokerId;
  // @ts-expect-error on the client the ref is a node-id string, not the instance
  c.broker.connect();
}
void clientProof;

// --- the generic is constrained to a config node ----------------------------
function constraintProof() {
  // A real config class (its instance type extends ConfigNode) is accepted.
  SchemaType.NodeRef<BrokerConfig>("broker-config");
  SchemaType.NodeRef("broker-config"); // untyped is fine too
  // @ts-expect-error pass the class name, not `typeof Class` — the constructor
  // form is no longer accepted (a class name in type position is the instance).
  SchemaType.NodeRef<typeof BrokerConfig>("broker-config");
  // @ts-expect-error a primitive is not a config node
  SchemaType.NodeRef<string>("broker-config");
  // @ts-expect-error a plain object is not a config node
  SchemaType.NodeRef<{ host: string }>("broker-config");
}
void constraintProof;

describe("NodeRef server/client plane typing (types-first node)", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  // The server-plane `this.config.<ref>` → instance proof lives inside the
  // fixture's `input()`; instantiating it here mirrors the sibling topology
  // tests (the deep proof is verified by `tsc` compiling the fixture).
  it("keeps `this.config.<ref>` typed as the config-node instance", async () => {
    const { node } = await createNode(NodeRefProbe);
    void node;
  });
});
