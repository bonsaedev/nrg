import { IONode, type Outputs, type Port } from "@bonsae/nrg/server";
import type { Order } from "../../shared/wc-types";

// A SOURCE (Input = never → no input port). Its output ADDS `order` to the
// record, so everything downstream can rely on `order` being present.
export default class WcSource extends IONode<
  never,
  never,
  never,
  Outputs<{ out: Port<{ order: Order }> }>
> {
  static override readonly type = "wc-source";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#a6bb8d";
}
