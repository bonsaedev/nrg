import { IONode, type Port } from "@bonsae/nrg/server";

// Input = any → one input port. Output = a named-Port record → one output port
// PER name (here two: matched / rejected).
export default class PortsRoute extends IONode<
  Record<string, never>,
  never,
  any,
  { matched: Port<{ id: string }>; rejected: Port<{ reason: string }> }
> {
  static override readonly type = "ports-route";
  static override readonly category = "port demo";
  static override readonly color: `#${string}` = "#e2d96e";
}
