import {
  IONode,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";
import type { Customer } from "../../shared/wc-types";

// CLEARS a field. It sends `customer: undefined`, typed `Port<{ customer:
// undefined }>` — the supported "remove". Downstream, a reader that REQUIRES
// `customer` reds; one that reads it as optional stays green. (There is no
// structural delete: at runtime the key is present-but-undefined.)
export default class WcClear extends IONode<
  never,
  never,
  Input<Port<{ customer: Customer }>>,
  Outputs<{ out: Port<{ customer: undefined }> }>
> {
  static override readonly type = "wc-clear";
  static override readonly category = "wire-check";
  static override readonly color: `#${string}` = "#b58bc7";
}
