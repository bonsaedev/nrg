import {
  IONode,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import type { Order, Customer } from "../../shared/wc-types";

// READS `order`, ADDS `customer`. It never mentions `order` on its output — the
// framework keeps `order` flowing on the record automatically (accumulation), so
// a node several hops downstream can still read it.
export default class WcEnrich extends IONode<
  never,
  never,
  Input<Port<{ order: Order }>>,
  Outputs<{ out: Port<{ customer: Customer }> }>
> {
  static override readonly type = "wc-enrich";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#a6bb8d";
}
