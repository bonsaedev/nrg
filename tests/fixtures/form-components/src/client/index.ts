import { defineNode, registerTypes } from "@bonsae/nrg/client";
import customFormNode from "./nodes/custom-form-node";

// A custom client entry takes over registration for EVERY node type — the
// schema-derived definitions are injected via __setSchemas and merged into
// each defineNode({ type }) at registration time.
registerTypes([
  customFormNode,
  defineNode({ type: "all-fields-node" }),
  defineNode({ type: "test-config" }),
  defineNode({ type: "basic-node" }),
  defineNode({ type: "ctx-modes-node" }),
]);
