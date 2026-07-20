import { IONode, type Outputs, type Port } from "@bonsae/nrg/server";
import type { Order, Customer } from "../../shared/wc-types";

// A SOURCE that adds BOTH `order` and `customer` in one go — used on one arm of a
// fan-in so that arm satisfies `wc-invoice` while a plain `wc-source` arm (only
// `order`) does not.
export default class WcFull extends IONode<
  never,
  never,
  never,
  Outputs<{ out: Port<{ order: Order; customer: Customer }> }>
> {
  static override readonly type = "wc-full";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#a6bb8d";
}
