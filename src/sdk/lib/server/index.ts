export { defineModule } from "./module";
export type { ModuleDefinition } from "./module";
export { registerType, registerTypes } from "./registration";
export { Node, IONode, ConfigNode } from "./nodes";
export type { ContextMode } from "./nodes";
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
export { Channels } from "./nodes/types/ports";

// The built-in lifecycle port message shapes, public so a generated package
// `index.d.ts` can reference them in its `NodeTypes` registry.
export type {
  MessageChannels,
  MessageMeta,
  NodeSource,
  ErrorPortOutput as ErrorPort,
  CompletePortOutput as CompletePort,
  StatusPortOutput as StatusPort,
} from "./nodes/types/ports";

/**
 * The editor connection registry, keyed by node-type string. A package's build
 * AUGMENTS this interface (`declare module "@bonsae/nrg/server"`) with one entry
 * per node — `{ input, outputs, complete, error, status }` — so the editor can
 * look a node's port types up and type-check a wire by synthesizing
 * `NodeTypes[target]["input"] = x as NodeTypes[source]["outputs"][port]`.
 * Empty here; every installed package merges its nodes in. See
 * tools/vite/server/plugins/node-types-dts.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- base interface, augmented per package
export interface NodeTypes {}
