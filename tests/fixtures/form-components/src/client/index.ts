import { defineNode, registerTypes } from "@bonsae/nrg/client";
import customFormNode from "./nodes/custom-form-node";

// A custom client entry takes over registration for EVERY node type. The build
// bakes each node's server-extracted schema (and convention form) onto its own
// defineNode({ type }) call — including the inline ones below — so the defs
// arrive at registerTypes already complete.
registerTypes([
  customFormNode,
  defineNode({ type: "greeting" }),
  defineNode({ type: "all-fields-node" }),
  defineNode({ type: "test-config" }),
  defineNode({ type: "basic-node" }),
  defineNode({ type: "output-schema-node" }),
  defineNode({ type: "ports-source" }),
  defineNode({ type: "ports-trigger" }),
  defineNode({ type: "ports-route" }),
  defineNode({ type: "ports-sink" }),
]);
