import { IONode, ConfigNode, type Infer } from "@/sdk/lib/server";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";

// A TYPES-FIRST fixture for the server-plane NodeRef proof. Its ports come purely
// from the generics (there is no inputSchema/outputsSchema fallback anymore) — but
// the topology is irrelevant here: this node exists so `tsc` proves that inside
// `input()` the `this.config.broker` NodeRef field resolves to the referenced
// config-node INSTANCE (the server IntelliSense we must keep), not a node-id
// string. The runtime arg to `NodeRef` is just the `type` string.
//
// BrokerConfig + ConfigSchema live here (the node source the extractor reads) and
// are re-exported so the test file can run the matching server-`Infer` and
// client-`Infer` proofs against the very same schema.

// A config node (must extend ConfigNode — NodeRef<T> constrains T to a config
// node) with distinguishing instance members the probe reaches for.
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

type Config = Infer<typeof ConfigSchema>;
type Input = { payload?: unknown };
type Output = unknown;

class NodeRefProbe extends IONode<
  Config,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "node-ref-probe";
  static override readonly configSchema = ConfigSchema;

  override async input() {
    // Instance members are visible — this is the IntelliSense we must keep.
    this.config.broker.connect();
    const flag: true = this.config.broker.isBroker;
    void flag;
    // @ts-expect-error the server ref is the instance, not a node-id string
    const bad: string = this.config.broker;
    void bad;
  }
}

export default NodeRefProbe;
export { BrokerConfig, ConfigSchema };
