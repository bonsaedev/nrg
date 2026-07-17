import { IONode } from "@bonsae/nrg/server";

// Input = typed → one input port. Output = never → NO output port (a sink,
// e.g. a node that only writes/logs and emits nothing downstream).
export default class PortsSink extends IONode<
  never,
  never,
  { data: unknown },
  never
> {
  static override readonly type = "ports-sink";
  static override readonly category = "port demo";
  static override readonly color: `#${string}` = "#dab6e0";
}
