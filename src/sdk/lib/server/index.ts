export { defineModule } from "./module";
export type { ModuleDefinition } from "./module";
export { registerType, registerTypes } from "./registration";
export { Node, IONode, ConfigNode } from "./nodes";
export type { NodeConstructor, INode, IIONode, IConfigNode } from "./nodes";
export { NrgError } from "../shared/errors";
export type { RED, NodeRedSettings } from "./node-red";
// The schema builders (`SchemaType`, `defineSchema`) and plane-neutral schema
// types (`Schema`, `TNodeRef`, `TTypedInput`) come from `@bonsae/nrg/schema` —
// not re-exported here, so the schema/server boundary stays structural (you
// can't pull a builder through the node runtime entry). `Infer` stays — the
// server-plane resolution type (NodeRef → node instance, TypedInput →
// `TypedInput<T>` wrapper) — as does `Port`, the per-port marker for declaring
// named/typed output ports directly in the `Output` generic.
export type { Infer } from "./schemas/types";
// `Port` — the per-port marker for named/dynamic ports; `Input` / `Outputs` — the
// input/output gates authors wrap their wire/port types with.
export type { Port, Input, Outputs } from "./nodes/types/ports";

// The message metadata shapes, public so a consumer can declare `_meta` on a port
// and read the framework provenance (`msg._meta.source`).
export type {
  MessageMeta,
  MessageMetadata,
  MessageSource,
  NodeSource,
} from "./nodes/types/ports";
