export { defineModule } from "./module";
export type { ModuleDefinition } from "./module";
export { registerType, registerTypes } from "./registration";
export { Node, IONode, ConfigNode } from "./nodes";
export type { NodeConstructor, INode, IIONode, IConfigNode } from "./nodes";
export { NrgError } from "../shared/errors";
export type { RED, NodeRedSettings } from "./red";
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
// `Channels` — the channel accessor SYMBOL: read or write a message's off-the-wire
// channel data with `msg[Channels].private` / `msg[Channels].protected`.
// `Meta` — the metadata accessor SYMBOL: read the framework metadata beside the
// data with `msg[Meta].source` (the producing node + port; framework-stamped).
export { Channels, Meta } from "./nodes/types/ports";

// The message channel + metadata shapes, public so a consumer can type code that
// reads `msg[Channels]` / `msg[Meta]`.
export type {
  MessageChannel,
  MessageChannels,
  WithMessageChannels,
  MessageMeta,
  MessageMetadata,
  WithMeta,
  MessageSource,
  NodeSource,
} from "./nodes/types/ports";
