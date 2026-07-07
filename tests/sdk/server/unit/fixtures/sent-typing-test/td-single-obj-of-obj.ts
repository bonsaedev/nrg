import { IONode } from "@/sdk/lib/server";

// Types-first fixture proving a single object-of-objects output is ONE port (not a
// named-port record): its values are plain objects, not `Port<T>` markers, so
// `meta`/`data` are FIELDS of the single output — addressed by `send()`/index, not
// as ports.
type Output = {
  meta: { v: number };
  data: { n: string };
};

class TdSingleObjOfObj extends IONode<
  Record<string, never>,
  Record<string, never>,
  unknown,
  Output
> {
  static override readonly type = "td-single-obj-of-obj";

  override async input() {
    this.send({ meta: { v: 1 }, data: { n: "x" } });
  }
}

export default TdSingleObjOfObj;
