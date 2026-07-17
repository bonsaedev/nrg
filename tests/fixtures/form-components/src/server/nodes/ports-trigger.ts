import { IONode } from "@bonsae/nrg/server";

// Input = any → one (untyped) input port — a config-driven node that is merely
// triggered and doesn't read msg directly. Output = typed → one output port.
export default class PortsTrigger extends IONode<
  never,
  never,
  any,
  { result: string }
> {
  static override readonly type = "ports-trigger";
  static override readonly category = "port demo";
  static override readonly color: `#${string}` = "#a6bbcf";
}
