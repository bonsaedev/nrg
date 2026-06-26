/**
 * Type-level contract shared by the server and client planes.
 *
 * `Static<>` of NRG's special schemas (NodeRef, TypedInput) produces these
 * brand shapes. Each plane maps them differently:
 *
 * - server `ResolvedStatic` (server/schemas/types): brand → runtime value
 *   (NodeRef → the node instance, TypedInput → the resolving wrapper)
 * - client `EditorStatic` (client/types): brand → editor form value
 *   (NodeRef → the referenced node id string, TypedInput → { value, type })
 *
 * Both planes import the brands from here, type-only, so renaming or
 * reshaping a brand is a compile error on both sides instead of silent
 * type drift. Keep this module free of runtime code and imports from
 * either plane.
 */

/** Brand produced by `Static` of a NodeRef schema. */
interface NodeRefResolved<T = any> {
  readonly __nrg_node_ref: true;
  readonly __instance: T;
}

/**
 * Structural shape of a resolved TypedInput (the server's TypedInput class
 * instance). The client matches this shape to map the field to its raw
 * editor value pair.
 */
interface TypedInputResolved {
  resolve(...args: any[]): any;
  value: unknown;
  type: string;
}

export type { NodeRefResolved, TypedInputResolved };
