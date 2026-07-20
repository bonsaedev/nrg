import { IONode, type Outputs, type Port } from "@bonsae/nrg/server";

// An UNTYPED source: its output is `Port<any>`, so the checker can't know what it
// puts on the record. A wire from here into a TYPED reader can't be verified — so
// it's a non-fatal WARNING (yellow), not a failure.
export default class WcUntyped extends IONode<
  never,
  never,
  never,
  Outputs<{ out: Port<any> }>
> {
  static override readonly type = "wc-untyped";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#c9b458";
}
