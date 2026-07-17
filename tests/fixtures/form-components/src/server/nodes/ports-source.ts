import { IONode } from "@bonsae/nrg/server";

// Input = never  → NO input port (a source node, e.g. a subscription/stream).
// Output = typed → one output port.
export default class PortsSource extends IONode<
  never,
  never,
  never,
  { event: unknown }
> {
  static override readonly type = "ports-source";
  static override readonly category = "port demo";
  static override readonly color: `#${string}` = "#87CEEB";
}
