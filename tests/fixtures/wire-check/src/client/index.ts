import { defineNode, registerTypes } from "@bonsae/nrg/client";

registerTypes([
  defineNode({ type: "wc-source" }),
  defineNode({ type: "wc-enrich" }),
  defineNode({ type: "wc-invoice" }),
  defineNode({ type: "wc-bad-source" }),
  defineNode({ type: "wc-untyped" }),
  defineNode({ type: "wc-clear" }),
  defineNode({ type: "wc-audit" }),
  defineNode({ type: "wc-ship" }),
  defineNode({ type: "wc-full" }),
]);
