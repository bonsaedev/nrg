import { defineIONode, ConfigNode } from "@/core/server/nodes";
import { defineSchema, SchemaType } from "@/core/shared/schemas";
import type { Infer as ServerInfer } from "@/core/server/schemas/types";
import type { Infer as ClientInfer } from "@/core/client/types";

// These nodes + functions are never executed. They exist so `tsc` (run via
// `pnpm validate:tsc`) proves the unified `SchemaType.NodeRef<T>("type")` form
// keeps server IntelliSense (the field resolves to the referenced node
// *instance*) while the client resolves the same field to the node-id `string`.
// The runtime arg is just the `type` string — no server class value is imported.

// A config node (must extend ConfigNode — NodeRef<T> now constrains T to a
// config node) with distinguishing instance members the probe reaches for.
class BrokerConfig extends ConfigNode {
  static override readonly type = "broker-config";
  readonly isBroker = true as const;
  connect(): void {}
}

const ConfigSchema = defineSchema(
  {
    // instance-type generic — the canonical (and only) authoring form: a class
    // name in type position is its instance type.
    broker: SchemaType.NodeRef<BrokerConfig>("broker-config"),
    // no generic — untyped reference (ConfigNodeBrand), still a valid node ref
    anyRef: SchemaType.NodeRef("broker-config"),
    name: SchemaType.String(),
  },
  { $id: "node-ref-probe:configs" },
);

// --- server plane: `this.config.<ref>` is the node INSTANCE -----------------
const Probe = defineIONode({
  type: "node-ref-probe",
  configSchema: ConfigSchema,
  inputSchema: SchemaType.Object({}),
  outputsSchema: SchemaType.Object({}),
  async input() {
    // Instance members are visible — this is the IntelliSense we must keep.
    this.config.broker.connect();
    const flag: true = this.config.broker.isBroker;
    void flag;
    // @ts-expect-error the server ref is the instance, not a node-id string
    const bad: string = this.config.broker;
    void bad;
  },
});
void Probe;

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
