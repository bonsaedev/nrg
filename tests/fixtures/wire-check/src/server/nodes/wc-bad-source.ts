import { IONode, type Outputs, type Port } from "@bonsae/nrg/server";

// A miswired source: it ADDS `order` as a plain `string`, not the `Order` object
// wc-invoice expects. Wiring it into wc-invoice is a same-name / wrong-type
// conflict — the sharpest kind of red.
export default class WcBadSource extends IONode<
  never,
  never,
  never,
  Outputs<{ out: Port<{ order: string }> }>
> {
  static override readonly type = "wc-bad-source";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#c7877f";
}
