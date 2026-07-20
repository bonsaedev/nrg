import { IONode, type Input, type Port } from "@bonsae/nrg/server";
import type { Order } from "../../shared/wc-types";

// A SINK that reads ONLY `order`. Used to show a clean same-name / wrong-type
// conflict: wire a source that adds `order` as a string into this and the check
// reports exactly that `order` is the wrong shape.
export default class WcShip extends IONode<
  never,
  never,
  Input<Port<{ order: Order }>>,
  never
> {
  static override readonly type = "wc-ship";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#87a2c7";
}
