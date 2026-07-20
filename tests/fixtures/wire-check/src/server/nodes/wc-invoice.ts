import { IONode, type Input, type Port } from "@bonsae/nrg/server";
import type { Order, Customer } from "../../shared/wc-types";

// A SINK (Output = never → no output port) that REQUIRES both `order` and
// `customer` on the arriving record. If either is missing — or has the wrong
// shape — the wire into it fails.
export default class WcInvoice extends IONode<
  never,
  never,
  Input<Port<{ order: Order; customer: Customer }>>,
  never
> {
  static override readonly type = "wc-invoice";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#87a2c7";
}
