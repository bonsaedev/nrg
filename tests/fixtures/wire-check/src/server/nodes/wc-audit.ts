import { IONode, type Input, type Port } from "@bonsae/nrg/server";
import type { Order, Customer } from "../../shared/wc-types";

// A SINK that reads `customer` as OPTIONAL (`customer?`). Because it doesn't
// require the field, a cleared (`undefined`) customer is fine — the wire from
// wc-clear into it stays green.
export default class WcAudit extends IONode<
  never,
  never,
  Input<Port<{ order: Order; customer?: Customer }>>,
  never
> {
  static override readonly type = "wc-audit";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#87a2c7";
}
